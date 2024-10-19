CREATE TABLE users(
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    google VARCHAR(255)
)
CREATE TABLE googleinfo(
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    familyName VARCHAR(255) NOT NULL,
    photos VARCHAR(255)
)