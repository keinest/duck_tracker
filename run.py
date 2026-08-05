import os
from app import create_app
from app.config import DevelopmentConfig, ProductionConfig

config_class = ProductionConfig if os.environ.get('FLASK_ENV') == 'production' else DevelopmentConfig
app = create_app(config_class)

if __name__ == '__main__':
    app.run(debug=True)
