# Some resource [POST /some/resource]

+ Request

    + Schema

            {
              "type": "object",
              "properties": {
                "prop1": {
                  "type": "string",
                  "required": true
                }
              }
            }

    + Body

            {
              "prop1": "a string"
            }

+ Response 200

    + Schema

            {
              "type": "object",
              "properties": {
                "prop1": {
                  "type": "string",
                  "required": true
                }
              }
            }

    + Body

            {
              "prop1": "a string"
            }

# Some resource 2 [/some/resource/2]

+ Model

    + Schema

            {
              "type": "object",
              "properties": {
                "prop1": {
                  "type": "string",
                  "required": true
                }
              }
            }

    + Body

            {
              "prop1": "a string"
            }

## POST

+ Request

    [Some resource 2][]

+ Response 200

    [Some resource 2][]

