from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt,
    set_refresh_cookies, unset_jwt_cookies
)
from app.extensions import db, limiter
from app.models.user import User

from marshmallow import ValidationError
from app.api.schemas import RegisterSchema

from app.utils.helpers import normalize_telephone

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

@auth_bp.route('/login', methods = ['POST'])
@limiter.limit("5 per minute") 
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'message': 'Requête invalide'}), 400

    telephone = normalize_telephone(data.get('telephone'))
    mot_de_passe = data.get('mot_de_passe')

    if not telephone or not mot_de_passe:
        return jsonify({'message': 'Téléphone et mot de passe requis'}), 400

    user = User.query.filter_by(telephone=telephone).first()

    if not user or not user.check_password(mot_de_passe):
        return jsonify({'message': 'Identifiants incorrects'}), 401

    if user.statut_compte != 'actif':
        return jsonify({'message': 'Compte désactivé, contactez votre administrateur'}), 403

    claims = user.get_jwt_claims()
    access_token = create_access_token(identity=str(user.id), additional_claims=claims)
    refresh_token = create_refresh_token(identity=str(user.id), additional_claims=claims)

    response = jsonify({
        'access_token': access_token,
        'user': {
            'id': user.id,
            'nom': user.nom,
            'prenom': user.prenom,
            'role': user.role,
            'region': user.region
        }
    })
    set_refresh_cookies(response, refresh_token)   # refresh token en cookie httpOnly
    return response, 200


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    claims = get_jwt()
    user = User.query.get(identity)

    if not user or user.statut_compte != 'actif':
        return jsonify({'message': 'Compte invalide'}), 401

    new_claims = user.get_jwt_claims()
    new_access_token = create_access_token(identity=identity, additional_claims=new_claims)
    return jsonify({'access_token': new_access_token}), 200


@auth_bp.route('/logout', methods=['POST'])
@jwt_required(refresh=True)
def logout():
    response = jsonify({'message': 'Déconnexion réussie'})
    unset_jwt_cookies(response)
    return response, 200


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    identity = get_jwt_identity()
    user = User.query.get(identity)
    if not user:
        return jsonify({'message': 'Utilisateur introuvable'}), 404

    return jsonify({
        'id': user.id,
        'nom': user.nom,
        'prenom': user.prenom,
        'telephone': user.telephone,
        'role': user.role,
        'region': user.region,
        'photo_profil': user.photo_profil
    }), 200

@auth_bp.route('/me', methods=['PUT'])
@jwt_required()
def update_me():
    identity = get_jwt_identity()
    user = User.query.get(identity)
    if not user:
        return jsonify({'message': 'Utilisateur introuvable'}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({'message': 'Requête invalide'}), 400

    if 'email' in data and data['email']:
        existing = User.query.filter(User.email == data['email'], User.id != user.id).first()
        if existing:
            return jsonify({'message': 'Cet email est déjà utilisé'}), 409
        user.email = data['email']

    if 'region' in data and data['region']:
        user.region = data['region']

    db.session.commit()
    return jsonify({
        'message': 'Profil mis à jour',
        'user': {
            'id': user.id, 'nom': user.nom, 'prenom': user.prenom,
            'telephone': user.telephone, 'email': user.email,
            'region': user.region, 'role': user.role
        }
    }), 200


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    identity = get_jwt_identity()
    user = User.query.get(identity)
    if not user:
        return jsonify({'message': 'Utilisateur introuvable'}), 404

    data = request.get_json(silent=True)
    ancien = data.get('ancien_mot_de_passe') if data else None
    nouveau = data.get('nouveau_mot_de_passe') if data else None

    if not ancien or not nouveau:
        return jsonify({'message': 'Champs requis manquants'}), 400

    if not user.check_password(ancien):
        return jsonify({'message': 'Mot de passe actuel incorrect'}), 401

    if len(nouveau) < 8:
        return jsonify({'message': 'Le nouveau mot de passe doit contenir au moins 8 caractères'}), 422

    user.set_password(nouveau)
    db.session.commit()
    return jsonify({'message': 'Mot de passe modifié avec succès'}), 200

from sqlalchemy.exc import IntegrityError

@auth_bp.route('/register', methods=['POST'])
@limiter.limit("10 per hour")
def register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'message': 'Requête invalide'}), 400
    
    if 'telephone' in data:
        data['telephone'] = normalize_telephone(data['telephone'])

    schema = RegisterSchema()
    try:
        validated = schema.load(data)
    except ValidationError as err:
        return jsonify({'message': 'Données invalides', 'erreurs': err.messages}), 422

    if User.query.filter_by(telephone=validated['telephone']).first():
        return jsonify({'message': 'Ce numéro de téléphone est déjà utilisé'}), 409

    if validated.get('email') and User.query.filter_by(email=validated['email']).first():
        return jsonify({'message': 'Cet email est déjà utilisé'}), 409

    user = User(
        nom=validated['nom'],
        prenom=validated['prenom'],
        telephone=validated['telephone'],
        email=validated.get('email'),
        region=validated['region'],
        role='superviseur',
        statut_compte='actif'
    )
    user.set_password(validated['mot_de_passe'])

    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'message': 'Ce numéro de téléphone ou cet email est déjà utilisé'}), 409

    return jsonify({
        'message': 'Compte créé avec succès',
        'user': {'id': user.id, 'nom': user.nom, 'prenom': user.prenom, 'role': user.role}
    }), 201

from flask import render_template

auth_views_bp = Blueprint('auth_views', __name__, url_prefix='/auth')

@auth_views_bp.route('/connexion', methods=['GET'])
def login_page():
    return render_template('auth/login.html')

@auth_views_bp.route('/inscription', methods=['GET'])
def register_page():
    return render_template('auth/register.html')