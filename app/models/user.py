from app.extensions import db
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    __tablename__ = 'users'

    id                = db.Column(db.Integer, primary_key = True)
    nom               = db.Column(db.String(100), nullable = False)
    prenom            = db.Column(db.String(100), nullable = False)
    telephone         = db.Column(db.String(20), unique = True, nullable = False)
    email             = db.Column(db.String(150), unique = True)
    mot_de_passe_hash = db.Column('mot_de_passe', db.String(255), nullable = False)
    role              = db.Column(db.Enum('superviseur', 'manager_regional', 'manager_national', 'admin', name = 'role_enum'), nullable = False)
    region            = db.Column(db.String(100))
    statut_compte     = db.Column(db.Enum('actif', 'inactif', name = 'statut_compte_enum'), default = 'actif')
    photo_profil      = db.Column(db.String(255))
    derniere_maj      = db.Column(db.DateTime, default = datetime.utcnow, onupdate = datetime.utcnow)
    date_creation     = db.Column(db.DateTime, default = datetime.utcnow)

    sessions = db.relationship('SessionPartage', backref = 'user', lazy = 'dynamic', cascade = 'all, delete-orphan')

    def set_password(self, password):
        self.mot_de_passe_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.mot_de_passe_hash, password)

    @property
    def statut_activite(self):
        """En ligne / Inactif / Hors ligne selon la dernière position reçue."""
        derniere = (self.sessions.filter_by(statut_session = 'active')
                    .join(Position).order_by(Position.horodatage.desc()).first())
        
    def get_jwt_claims(self):
        return {
            'role': self.role,
            'region': self.region,
            'nom_complet': f"{self.prenom} {self.nom}"
        }