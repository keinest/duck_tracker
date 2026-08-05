from marshmallow import Schema, fields, validate, ValidationError

class RegisterSchema(Schema):
    nom = fields.Str(required=True,validate=validate.Length(min=2, max=100))
    prenom = fields.Str(required=True, validate=validate.Length(min=2, max=100))
    telephone = fields.Str(required=True, validate=validate.Regexp(r'^6\d{8}$', error="Numero invalide"))
    email = fields.Email(required=False, allow_none=True)
    mot_de_passe = fields.Str(required=True, validate=validate.Length(min=8, error="8 caracteres minimum"))
    region = fields.Str(required=True, validate=validate.OneOf(['Littoral', 'Centre', 'Nord', 'Ouest', 'Sud', 'Est', 'Adamaoua', 'Extreme-Nord', 'Nord-Ouest', 'Sud-Ouest']))

class CreateUserByAdminSchema(RegisterSchema):
    role = fields.Str(required=True, validate=validate.OneOf(['superviseur', 'manager_regional', 'manager_national', 'admin']))

