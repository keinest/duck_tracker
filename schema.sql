CREATE TABLE users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    nom             VARCHAR(100) NOT NULL,
    prenom          VARCHAR(100) NOT NULL,
    telephone       VARCHAR(20) UNIQUE NOT NULL,
    email           VARCHAR(150) UNIQUE,
    mot_de_passe    VARCHAR(255) NOT NULL,        -- hash bcrypt/argon2, jamais en clair
    role            ENUM('superviseur', 'manager_regional', 'manager_national', 'admin') NOT NULL,
    region          VARCHAR(100),                  -- ex: 'Littoral', 'Centre', 'Nord', 'Ouest', 'Sud'
    statut_compte   ENUM('actif', 'inactif') DEFAULT 'actif',
    photo_profil    VARCHAR(255),
    derniere_maj    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    date_creation   DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_role (role),
    INDEX idx_region (region)
) ENGINE=InnoDB;

CREATE TABLE sessions_partage (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    date_session    DATE NOT NULL,
    heure_debut     DATETIME NOT NULL,
    heure_fin       DATETIME NULL,                 -- NULL tant que le partage est actif
    distance_totale FLOAT DEFAULT 0,                -- km, recalculé à la clôture
    duree_totale    INT DEFAULT 0,                  -- secondes
    vitesse_max     FLOAT DEFAULT 0,                -- km/h
    statut_session  ENUM('active', 'terminee') DEFAULT 'active',

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, date_session)
) ENGINE=InnoDB;

CREATE TABLE positions_gps (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id      INT NOT NULL,
    user_id         INT NOT NULL,                  -- dénormalisé volontairement : évite un JOIN pour la carte temps réel
    latitude        DECIMAL(10, 7) NOT NULL,
    longitude       DECIMAL(10, 7) NOT NULL,
    vitesse         FLOAT DEFAULT 0,                -- km/h à cet instant
    horodatage      DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES sessions_partage(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session (session_id),
    INDEX idx_user_horodatage (user_id, horodatage)  -- clé pour calculer le statut en temps réel rapidement
) ENGINE=InnoDB;

CREATE TABLE points_arret (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    session_id      INT NOT NULL,
    latitude        DECIMAL(10, 7) NOT NULL,
    longitude        DECIMAL(10, 7) NOT NULL,
    heure_arrivee   DATETIME NOT NULL,
    heure_depart    DATETIME NULL,
    duree_arret     INT DEFAULT 0,                  -- secondes
    adresse         VARCHAR(255) NULL,               -- reverse geocoding, optionnel

    FOREIGN KEY (session_id) REFERENCES sessions_partage(id) ON DELETE CASCADE,
    INDEX idx_session (session_id)
) ENGINE=InnoDB;