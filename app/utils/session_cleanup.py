from datetime import datetime, timedelta
from app.extensions import db
from app.models.position import SessionPartage, Position

STALE_SESSION_THRESHOLD_SECONDS = 180  # 3 minutes sans nouvelle position = session abandonnée


def close_stale_sessions():
    """Ferme automatiquement les sessions 'active' qui n'ont reçu aucune position
    récente (client qui a perdu la connexion, fermé l'app, ou dont le téléphone
    s'est éteint sans jamais appeler /session/stop proprement)."""
    threshold_time = datetime.utcnow() - timedelta(seconds=STALE_SESSION_THRESHOLD_SECONDS)

    active_sessions = SessionPartage.query.filter_by(statut_session='active').all()
    closed_any = False

    for session in active_sessions:
        last_position = (Position.query.filter_by(session_id=session.id)
                          .order_by(Position.horodatage.desc()).first())

        last_activity = last_position.horodatage if last_position else session.heure_debut

        if last_activity < threshold_time:
            session.heure_fin = last_activity
            session.statut_session = 'terminee'
            session.duree_totale = int((session.heure_fin - session.heure_debut).total_seconds())
            closed_any = True

    if closed_any:
        db.session.commit()