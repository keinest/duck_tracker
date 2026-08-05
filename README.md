# duc_tracker

Application Flask pour le suivi des superviseurs et la gestion des managers.

## Installation

1. Créez un environnement virtuel :
   python3 -m venv venv
   source venv/bin/activate

2. Installez les dépendances :
   pip install -r requirements.txt

3. Configurez les variables dans `.env`.

4. Lancez l'application :
   python3 run.py

## Structure

- `app/` : package Flask
- `app/api/` : schémas et API REST
- `app/auth/` : authentification
- `app/manager/` : routes manager
- `app/superviseur/` : routes superviseur
- `app/models/` : modèles SQLAlchemy
- `app/static/` : fichiers statiques
- `app/templates/` : templates Jinja

## Notes

- `requirement.txt` était un duplicata vide et a été supprimé.
- Les fichiers vides non utilisés ont été nettoyés pour la mise en production.
