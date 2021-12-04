HOST: https://www.testhost.com

# Some resource [POST /some/resource]
+ Request (application/json)
    + Header
        x-testhost-auth-sign: signed body

    + Header
        Authorization: Bearer Admin
    
    + Header
        Authorization: Bearer User
    
     + Schema
        {
            "type": "object",
            "properties": {
                "someType": {
                    "type": "string"
                }
            }
        }

+ Request (application/json)
    + Header
        x-testhost-auth-sign: signed body

    + Header
        Authorization: Bearer Admin
    
    + Header
        Authorization: Bearer User

   + Schema
        {
            "type": "object",
            "properties": {
                "someType": {
                    "type": "string"
                }
            }
        }

+ Response 200


# Restricted resource [GET /some/restricted/resource]
Has a duplicate header within a single declaration
+ Request (application/json)
    + Header
        Authorization: Bearer Admin
        Authorization: Bearer Admin

    + Schema
        {
            "type": "object",
            "properties": {
                "message1": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

+ Response 200

# Additional resource [GET /additional/resource]
+ Request (application/json)
    + Header
        x-testhost-auth-sign: signed body
        Authorization: Bearer Admin
        Authorization: Bearer User

+ Response 200