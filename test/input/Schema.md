# Some resource [POST /some/resource]

+ Request

    + Schema

            {
              "type": "object",
              "properties": {
                "prop1": {
                  "type": "string"
                }
              },
              "required": ["prop1"]
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
                  "type": "string"
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
                  "type": "string"
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

# Some resource 3 [/some/resource/3]

## POST

+ Request (application/json)

    {"prop1": "a string", "prop2": 1, "prop3": {"prop3a": false, "prop3b": [{"prop3b1": 1}, {"prop3b1": 2}]}}

+ Response 200 (application/json)

    + Body
            {
              "prop1": "a string"
            }
      
