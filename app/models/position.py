from app.extensions import db
from datetime import datetime

class SessionPartage(db.Model):
    __tablename__ = 'sessions_partage'

    id              = db.Column(db.Integer, primary_key=True)
    user_id         = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date_session    = db.Column(db.Date, nullable=False)
    heure_debut     = db.Column(db.DateTime, nullable=False)
    heure_fin       = db.Column(db.DateTime, nullable=True)
    distance_totale = db.Column(db.Float, default=0)
    duree_totale    = db.Column(db.Integer, default=0)
    vitesse_max     = db.Column(db.Float, default=0)
    statut_session  = db.Column(db.Enum('active', 'terminee', name='statut_session_enum'), default='active')

    positions = db.relationship('Position', backref='session', lazy='dynamic', cascade='all, delete-orphan')
    arrets    = db.relationship('PointArret', backref='session', lazy='dynamic', cascade='all, delete-orphan')

class Position(db.Model):
    __tablename__ = 'positions_gps'

    id         = db.Column(db.BigInteger, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions_partage.id'), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    latitude   = db.Column(db.Numeric(10, 7), nullable=False)
    longitude  = db.Column(db.Numeric(10, 7), nullable=False)
    vitesse    = db.Column(db.Float, default=0)
    horodatage = db.Column(db.DateTime, default=datetime.utcnow)

class PointArret(db.Model):
    __tablename__ = 'points_arret'

    id            = db.Column(db.Integer, primary_key=True)
    session_id    = db.Column(db.Integer, db.ForeignKey('sessions_partage.id'), nullable=False)
    latitude      = db.Column(db.Numeric(10, 7), nullable=False)
    longitude     = db.Column(db.Numeric(10, 7), nullable=False)
    heure_arrivee = db.Column(db.DateTime, nullable=False)
    heure_depart  = db.Column(db.DateTime, nullable=True)
    duree_arret   = db.Column(db.Integer, default=0)
    adresse       = db.Column(db.String(255), nullable=True)