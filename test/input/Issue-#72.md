### Create a user [POST /api/scim/v2/Users]

+ Request
    + Headers

            Content-Type: application/scim+json
            Authorization: Bearer token

    + Body

            {
                "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
                "userName": "fredsmith",
                "name": {
                    "givenName": "Fred",
                    "familyName": "Smith"
                },
                "emails": [
                    {"primary": true, "value": "fred@example.com", "type": "work"}
                ],
                "displayName": "Fred Smith",
                "externalId": "fred-external-id",
                "active": true
            }

+ Response 201 (application/scim+json)

    + Attributes (ExistingUser)

### Create a user 2 [POST /api2/scim/v2/Users]

+ Request
    + Headers

            Content-Type: application/scim+json
            Authorization: Bearer token

+ Response 201 (application/scim+json)

    + Attributes (ExistingUser)

# Data Structures
## ExistingUser
