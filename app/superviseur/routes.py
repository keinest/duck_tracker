import os
import json
import urllib.request
import urllib.parse
from flask import Blueprint, request, jsonify, render_template
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.position import SessionPartage, Position, PointArret
from app.utils.session_cleanup import close_stale_sessions

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def reverse_geocode(lat, lng):
    """Convertit des coordonnées GPS en adresse lisible via OpenCage. Renvoie None en cas d'échec (non bloquant)."""
    api_key = os.environ.get('OPENCAGE_API_KEY')
    if not api_key:
        return None
    try:
        params = urllib.parse.urlencode({
            'q': f'{lat},{lng}',
            'key': api_key,
            'language': 'fr',
            'no_annotations': 1
        })
        url = f'https://api.opencagedata.com/geocode/v1/json?{params}'
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            if data.get('results'):
                return data['results'][0].get('formatted')
    except Exception:
        pass
    return None


# --- Paramètres de détection d'arrêt ---
STOP_RADIUS_KM = 0.05       # 50 mètres
MIN_STOP_SECONDS = 20       # durée minimale d'immobilité pour compter comme un arrêt


def detect_and_manage_stop(session, current_lat, current_lng, current_time):
    """Détecte si le superviseur est immobile depuis un moment, crée/ferme un PointArret en conséquence."""
    window_start_time = current_time - timedelta(seconds=MIN_STOP_SECONDS + 30)
    recent_positions = (Position.query
                         .filter(Position.session_id == session.id)
                         .filter(Position.horodatage >= window_start_time)
                         .order_by(Position.horodatage.asc())
                         .all())

    is_stationary = False
    anchor = None

    if recent_positions:
        anchor = recent_positions[0]
        anchor_lat = float(anchor.latitude)
        anchor_lng = float(anchor.longitude)

        all_within_radius = all(
            haversine_km(anchor_lat, anchor_lng, float(p.latitude), float(p.longitude)) <= STOP_RADIUS_KM
            for p in recent_positions
        ) and haversine_km(anchor_lat, anchor_lng, current_lat, current_lng) <= STOP_RADIUS_KM

        duration = (current_time - anchor.horodatage).total_seconds()

        if all_within_radius and duration >= MIN_STOP_SECONDS:
            is_stationary = True

    open_arret = (PointArret.query
                  .filter_by(session_id=session.id, heure_depart=None)
                  .order_by(PointArret.id.desc()).first())

    if is_stationary and not open_arret:
        adresse = reverse_geocode(anchor_lat, anchor_lng)
        new_arret = PointArret(
            session_id=session.id,
            latitude=anchor_lat,
            longitude=anchor_lng,
            heure_arrivee=anchor.horodatage,
            adresse=adresse
        )
        db.session.add(new_arret)

    elif not is_stationary and open_arret:
        open_arret.heure_depart = current_time
        open_arret.duree_arret = int((open_arret.heure_depart - open_arret.heure_arrivee).total_seconds())


# --- API ---
superviseur_bp = Blueprint('superviseur', __name__, url_prefix='/api/superviseur')


@superviseur_bp.route('/session/active', methods=['GET'])
@jwt_required()
def session_active():
    close_stale_sessions()
    user_id = get_jwt_identity()
    session = SessionPartage.query.filter_by(user_id=user_id, statut_session='active').first()
    if not session:
        return jsonify({'active': False}), 200

    positions = (Position.query.filter_by(session_id=session.id)
                 .order_by(Position.horodatage.asc()).all())
    if len(positions) > 200:
        step = max(1, len(positions) // 200)
        positions = positions[::step]

    nb_arrets = PointArret.query.filter_by(session_id=session.id).count()

    return jsonify({
        'active': True,
        'session_id': session.id,
        'heure_debut': session.heure_debut.isoformat(),
        'positions': [{'lat': float(p.latitude), 'lng': float(p.longitude)} for p in positions],
        'nb_arrets': nb_arrets
    }), 200


@superviseur_bp.route('/session/start', methods=['POST'])
@jwt_required()
def session_start():
    user_id = get_jwt_identity()
    existing = SessionPartage.query.filter_by(user_id=user_id, statut_session='active').first()
    if existing:
        return jsonify({'message': 'Une session est déjà active', 'session_id': existing.id}), 409

    session = SessionPartage(
        user_id=user_id,
        date_session=datetime.utcnow().date(),
        heure_debut=datetime.utcnow(),
        statut_session='active'
    )
    db.session.add(session)
    db.session.commit()
    return jsonify({'session_id': session.id, 'heure_debut': session.heure_debut.isoformat()}), 201


@superviseur_bp.route('/session/stop', methods=['POST'])
@jwt_required()
def session_stop():
    user_id = get_jwt_identity()
    session = SessionPartage.query.filter_by(user_id=user_id, statut_session='active').first()
    if not session:
        return jsonify({'message': 'Aucune session active'}), 404

    # Ferme un éventuel arrêt encore ouvert au moment où le superviseur arrête le partage
    open_arret = (PointArret.query
                  .filter_by(session_id=session.id, heure_depart=None)
                  .order_by(PointArret.id.desc()).first())
    if open_arret:
        open_arret.heure_depart = datetime.utcnow()
        open_arret.duree_arret = int((open_arret.heure_depart - open_arret.heure_arrivee).total_seconds())

    session.heure_fin = datetime.utcnow()
    session.statut_session = 'terminee'
    session.duree_totale = int((session.heure_fin - session.heure_debut).total_seconds())
    db.session.commit()
    return jsonify({'message': 'Session terminée'}), 200

@superviseur_bp.route('/position', methods=['POST'])
@jwt_required()
def add_position():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not data or 'latitude' not in data or 'longitude' not in data:
        return jsonify({'message': 'Coordonnées manquantes'}), 400

    session = SessionPartage.query.filter_by(user_id=user_id, statut_session='active').first()
    if not session:
        return jsonify({'message': 'Aucune session active'}), 409

    now = datetime.utcnow()

    last_position = (Position.query.filter_by(session_id=session.id)
                      .order_by(Position.horodatage.desc()).first())

    position = Position(
        session_id=session.id,
        user_id=user_id,
        latitude=data['latitude'],
        longitude=data['longitude'],
        vitesse=data.get('vitesse', 0),
        horodatage=now
    )
    db.session.add(position)

    if last_position:
        d = haversine_km(
            float(last_position.latitude), float(last_position.longitude),
            float(data['latitude']), float(data['longitude'])
        )
        if d < 5:
            session.distance_totale = (session.distance_totale or 0) + d

    if data.get('vitesse', 0) > (session.vitesse_max or 0):
        session.vitesse_max = data['vitesse']

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': 'Erreur lors de l\'enregistrement de la position'}), 500

    nb_arrets = PointArret.query.filter_by(session_id=session.id).count()
    try:
        detect_and_manage_stop(session, float(data['latitude']), float(data['longitude']), now)
        db.session.commit()
        nb_arrets = PointArret.query.filter_by(session_id=session.id).count()
    except Exception as e:
        db.session.rollback()
        print(f"[detect_and_manage_stop] erreur non bloquante: {e}")

    return jsonify({'message': 'Position enregistrée', 'nb_arrets': nb_arrets}), 201


@superviseur_bp.route('/historique', methods=['GET'])
@jwt_required()
def historique():
    from sqlalchemy import extract
    user_id = get_jwt_identity()
    periode = request.args.get('periode', 'mois')
    tri = request.args.get('tri', 'date_desc')

    query = SessionPartage.query.filter_by(user_id=user_id, statut_session='terminee')

    today = datetime.utcnow().date()
    if periode == 'jour':
        query = query.filter(SessionPartage.date_session == today)
    elif periode == 'semaine':
        start_week = today - timedelta(days=today.weekday())
        query = query.filter(SessionPartage.date_session >= start_week)
    elif periode == 'mois':
        query = query.filter(
            extract('year', SessionPartage.date_session) == today.year,
            extract('month', SessionPartage.date_session) == today.month
        )

    if tri == 'date_asc':
        query = query.order_by(SessionPartage.heure_debut.asc())
    elif tri == 'distance':
        query = query.order_by(SessionPartage.distance_totale.desc())
    else:
        query = query.order_by(SessionPartage.heure_debut.desc())

    sessions = query.all()

    result = []
    for s in sessions:
        nb_arrets = PointArret.query.filter_by(session_id=s.id).count()
        result.append({
            'id': s.id,
            'date_session': s.date_session.isoformat(),
            'heure_debut': s.heure_debut.isoformat(),
            'heure_fin': s.heure_fin.isoformat() if s.heure_fin else None,
            'duree_totale': s.duree_totale,
            'distance_totale': round(s.distance_totale or 0, 1),
            'vitesse_max': s.vitesse_max or 0,
            'nb_arrets': nb_arrets
        })

    return jsonify(result), 200


@superviseur_bp.route('/trajet/<int:session_id>', methods=['GET'])
@jwt_required()
def trajet_detail(session_id):
    user_id = get_jwt_identity()
    session = SessionPartage.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({'message': 'Trajet introuvable'}), 404

    positions = (Position.query.filter_by(session_id=session.id)
                 .order_by(Position.horodatage.asc()).all())

    if len(positions) > 100:
        step = max(1, len(positions) // 100)
        positions_sample = positions[::step]
    else:
        positions_sample = positions

    arrets = (PointArret.query.filter_by(session_id=session.id)
              .order_by(PointArret.heure_arrivee.asc()).all())

    return jsonify({
        'id': session.id,
        'date_session': session.date_session.isoformat(),
        'heure_debut': session.heure_debut.isoformat(),
        'heure_fin': session.heure_fin.isoformat() if session.heure_fin else None,
        'duree_totale': session.duree_totale,
        'distance_totale': round(session.distance_totale or 0, 1),
        'vitesse_max': session.vitesse_max or 0,
        'positions': [{'lat': float(p.latitude), 'lng': float(p.longitude)} for p in positions_sample],
        'arrets': [{
            'id': a.id,
            'heure_arrivee': a.heure_arrivee.isoformat(),
            'heure_depart': a.heure_depart.isoformat() if a.heure_depart else None,
            'duree_arret': a.duree_arret,
            'adresse': a.adresse
        } for a in arrets]
    }), 200


# --- Pages HTML ---
superviseur_views_bp = Blueprint('superviseur_views', __name__, url_prefix='/superviseur')

@superviseur_views_bp.route('/accueil')
def accueil():
    return render_template('superviseur/accueil.html')

@superviseur_views_bp.route('/historique')
def historique_page():
    return render_template('superviseur/historique.html')

@superviseur_views_bp.route('/profil')
def profil():
    return render_template('superviseur/profil.html')