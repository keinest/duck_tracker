from flask import Blueprint, request, jsonify, render_template
from marshmallow import ValidationError
from flask_jwt_extended import get_jwt
from datetime import date, timedelta
from app.extensions import db, limiter
from app.models.user import User
from app.models.position import SessionPartage, Position, PointArret
from app.api.schemas import CreateUserByAdminSchema
from app.utils.decorators import role_required
from sqlalchemy import extract

from app.utils.session_cleanup import close_stale_sessions
from app.utils.helpers import normalize_telephone

manager_bp = Blueprint('manager', __name__, url_prefix='/api/manager')

@manager_bp.route('/users', methods=['GET'])
@role_required('manager_regional', 'manager_national', 'admin')
def list_utlisateurs():
    claims = get_jwt()

    query = User.query

    if claims.get('role') == 'manager_regional':
        query = query.filter_by(region=claims.get('region'))

    role_filtre = request.args.get('role')

    if role_filtre == 'manager':
        query = query.filter(User.role.in_(['manager_regional', 'manager_national']))
    elif role_filtre:
        query = query.filter_by(role=role_filtre)

    utilisateurs = query.order_by(User.nom).all()

    return jsonify([{
        'id': u.id, 'nom': u.nom, 'prenom': u.prenom, 'telephone': u.telephone,
        'role': u.role, 'region': u.region, 'statut_compte': u.statut_compte
    } for u in utilisateurs]), 200

@manager_bp.route('/users', methods=['POST'])
@role_required('manager_national', 'admin')
@limiter.limit("20 per hour")
def create_utilisateur():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({'message': 'Requete invalide'}), 400

    if 'telephone' in data:
        data['telephone'] = normalize_telephone(data['telephone'])

    schema = CreateUserByAdminSchema()
    
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({'message': 'Donnees invalides', 'erreurs': err.messages}), 409

    user = User(
        nom=validated['nom'], prenom=validated['prenom'],
        telephone=validated['telephone'], email=validated.get('email'),
        region=validated['region'], role=validated['role'], statut_compte='actif'
    )

    user.set_password(validated['mot_de_passe'])
    
    db.session.add(user)
    db.session.commit()

    return jsonify({'message': 'Utilisateur cree', 'id': user.id}), 201

@manager_bp.route('/users/<int:user_id>/statut', methods=['PATCH'])
@role_required('manager_regional', 'manager_national', 'admin')
def toggle_statut_utilisateur(user_id):
    """Active/Desactive un compte (bouton visible sur l'ecran Gestion des utilisateurs). """

    user = User.query.get_or_404(user_id)
    nouveau_statut = request.json.get('statut_compte')

    if nouveau_statut not in ('actif', 'inactif'):
        return jsonify({'message': 'Statut invalide !'}), 400

    user.statut_compte = nouveau_statut
    db.session.commit()
    return jsonify({'message': f"Statut mis a jour: {nouveau_statut}"}), 200

@manager_bp.route('/dashboard', methods=['GET'])
@role_required('manager_regional', 'manager_national', 'admin')
def dashboard_summary():
    close_stale_sessions()
    claims = get_jwt()
    role = claims.get('role')
    region = claims.get('region')

    base_query = User.query
    if role == 'manager_regional':
        base_query = base_query.filter_by(region=region)

    total_utilisateurs = base_query.count()
    total_superviseurs = base_query.filter_by(role='superviseur').count()
    total_managers = base_query.filter(User.role.in_(['manager_regional', 'manager_national'])).count()
    total_comptes_inactifs = base_query.filter_by(statut_compte='inactif').count()

    active_query = SessionPartage.query.join(User).filter(SessionPartage.statut_session == 'active')
    if role == 'manager_regional':
        active_query = active_query.filter(User.region == region)
    total_sessions_actives = active_query.count()

    active_user_ids = {
        user_id for (user_id,) in active_query.with_entities(SessionPartage.user_id).all()
    }

    superviseurs = (base_query.filter_by(role='superviseur')
                    .order_by(User.nom)
                    .limit(30)
                    .all())

    return jsonify({
        'total_utilisateurs': total_utilisateurs,
        'total_superviseurs': total_superviseurs,
        'total_managers': total_managers,
        'total_sessions_actives': total_sessions_actives,
        'total_comptes_inactifs': total_comptes_inactifs,
        'superviseurs': [{
            'id': u.id,
            'nom': u.nom,
            'prenom': u.prenom,
            'role': u.role,
            'region': u.region,
            'statut_compte': u.statut_compte,
            'derniere_maj': u.derniere_maj.isoformat() if u.derniere_maj else None,
            'date_creation': u.date_creation.isoformat() if u.date_creation else None,
            'en_ligne': u.id in active_user_ids
        } for u in superviseurs]
    }), 200


@manager_bp.route('/sessions', methods=['GET'])
@role_required('manager_regional', 'manager_national', 'admin')
def list_sessions():
    claims = get_jwt()
    role = claims.get('role')
    region = claims.get('region')

    periode = request.args.get('periode', 'mois')
    tri = request.args.get('tri', 'date_desc')

    query = SessionPartage.query.join(User).filter(SessionPartage.statut_session == 'terminee')
    if role == 'manager_regional':
        query = query.filter(User.region == region)

    today = date.today()
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
        result.append({
            'id': s.id,
            'superviseur': f"{s.user.prenom} {s.user.nom}",
            'region': s.user.region,
            'date_session': s.date_session.isoformat(),
            'heure_debut': s.heure_debut.isoformat(),
            'heure_fin': s.heure_fin.isoformat() if s.heure_fin else None,
            'duree_totale': s.duree_totale,
            'distance_totale': round(s.distance_totale or 0, 1),
            'vitesse_max': s.vitesse_max or 0
        })

    return jsonify(result), 200


@manager_bp.route('/session/<int:session_id>', methods=['GET'])
@role_required('manager_regional', 'manager_national', 'admin')
def session_detail(session_id):
    claims = get_jwt()
    role = claims.get('role')
    region = claims.get('region')

    session = (SessionPartage.query.join(User)
               .filter(SessionPartage.id == session_id)
               .filter(User.id == SessionPartage.user_id)
               .first())
    if not session:
        return jsonify({'message': 'Session introuvable'}), 404

    if role == 'manager_regional' and session.user.region != region:
        return jsonify({'message': 'Accès interdit'}), 403

    positions = (Position.query.filter_by(session_id=session.id)
                 .order_by(Position.horodatage.asc()).all())
    if len(positions) > 100:
        step = max(1, len(positions) // 100)
        positions = positions[::step]

    arrets = (PointArret.query.filter_by(session_id=session.id)
              .order_by(PointArret.heure_arrivee.asc()).all())

    return jsonify({
        'id': session.id,
        'superviseur': f"{session.user.prenom} {session.user.nom}",
        'region': session.user.region,
        'date_session': session.date_session.isoformat(),
        'heure_debut': session.heure_debut.isoformat(),
        'heure_fin': session.heure_fin.isoformat() if session.heure_fin else None,
        'duree_totale': session.duree_totale,
        'distance_totale': round(session.distance_totale or 0, 1),
        'vitesse_max': session.vitesse_max or 0,
        'positions': [{'lat': float(p.latitude), 'lng': float(p.longitude)} for p in positions],
        'arrets': [{
            'id': a.id,
            'heure_arrivee': a.heure_arrivee.isoformat(),
            'heure_depart': a.heure_depart.isoformat() if a.heure_depart else None,
            'duree_arret': a.duree_arret,
            'adresse': a.adresse
        } for a in arrets]
    }), 200


@manager_bp.route('/locations', methods=['GET'])
@role_required('manager_regional', 'manager_national', 'admin')
def active_locations():
    close_stale_sessions()
    claims = get_jwt()
    role = claims.get('role')
    region = claims.get('region')

    active_sessions = SessionPartage.query.join(User).filter(SessionPartage.statut_session == 'active')
    if role == 'manager_regional':
        active_sessions = active_sessions.filter(User.region == region)
    active_sessions = active_sessions.order_by(SessionPartage.heure_debut.desc()).all()

    locations = []
    for session in active_sessions:
        last_position = Position.query.filter_by(session_id=session.id).order_by(Position.horodatage.desc()).first()
        locations.append({
            'session_id': session.id,
            'superviseur': f"{session.user.prenom} {session.user.nom}",
            'region': session.user.region,
            'heure_debut': session.heure_debut.isoformat(),
            'latitude': float(last_position.latitude) if last_position else None,
            'longitude': float(last_position.longitude) if last_position else None,
            'vitesse': last_position.vitesse if last_position else None,
            'derniere_maj': last_position.horodatage.isoformat() if last_position else None
        })

    return jsonify(locations), 200


manager_views_bp = Blueprint('manager_views', __name__, url_prefix='/manager')

@manager_views_bp.route('/dashboard')
def dashboard_page():
    return render_template('manager/dashboard.html')


@manager_views_bp.route('/utilisateurs')
def gestion_utilisateurs():
    return render_template('manager/gestion_utilisateurs.html')


@manager_views_bp.route('/historique')
def historique():
    return render_template('manager/historique_superviseur.html')


@manager_views_bp.route('/carte')
def carte_superviseurs():
    return render_template('manager/carte_superviseurs.html')
    