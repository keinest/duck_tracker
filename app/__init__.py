from flask import Flask
from app.config import DevelopmentConfig
from app.extensions import db, migrate, jwt, limiter, cors

def create_app(config_class=DevelopmentConfig):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    cors.init_app(app, supports_credentials=True) 

    from app.models import user, position
    from app.auth.routes import auth_bp, auth_views_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(auth_views_bp)
    
    from app.manager.routes import manager_bp, manager_views_bp
    app.register_blueprint(manager_bp)
    app.register_blueprint(manager_views_bp)
    
    from app.main.routes import main_bp
    app.register_blueprint(main_bp)
    
    from app.superviseur.routes import superviseur_bp, superviseur_views_bp
    app.register_blueprint(superviseur_bp)
    app.register_blueprint(superviseur_views_bp)

    return app

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return {'message': 'Session expirée, veuillez vous reconnecter'}, 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return {'message': 'Token invalide'}, 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return {'message': 'Authentification requise'}, 401
