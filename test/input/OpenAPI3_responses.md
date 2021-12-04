HOST: https://www.testhost.com

# Some resource [GET /some/resource]

+ Request

+ Response 200 (application/json)
    + Headers
        X-My-Message-Header: 42

    + Body
        { 
            "message": "Hello World!" 
        }

    + Schema
        {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }


+ Response 200 (application/json)
    Unique schema

    + Headers
        X-My-Message-Header: 42

    + Body
        { "other": "Hello World!" }

    + Schema
        {
            "type": "object",
            "properties": {
                "other": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

+ Response 200 (application/json)
    Duplicate Schema

    + Headers
        X-My-Message-Header: 42

    + Body
        { "other": "Hello World!" }

    + Schema
        {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

+ Response 200 (application/json)
    Array schema

      + Headers
        X-My-Message-Header: 42

    + Body
        [{ "message": "Hello World!" }]

    + Schema
        {
            "type": "array",
            "items":  {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "This is the message description "
                    }
                }
            }
        }


+ Response 400 (application/json)
    + Body
        { "message": "Invalid data" }

# Some resource [POST /some/resource]

+ Request

+ Response 200 (application/json)
    + Headers
        X-My-Message-Header: 42

    + Body
        { 
            "message": "Hello World!" 
        }

    + Schema
        {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }


+ Response 200 (application/json)
    + Headers
        X-My-Message-Header: 42

    + Body
        { "message": "Hello World!" }

    + Schema
        {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

# Some resource [GET /test/attributes]

- Request

- Response 200 (application/json)
    - Body
        { "message": "Hello World!" }

    - Attributes (Message)

- Response 200 (application/json)
    - Body
        { "message": "Hello World2" }

    - Attributes (Message)

- Response 200 (application/json)
    - Body
        { "otherMessage": "Hello World!" }

    - Attributes (OtherMessage)

# Message [GET /message]

+ Response 200 (application/json)
    Unparsable schema should fall back to Attributes

    + Schema
        {1234{}I'm unparsable}

    + Attributes (Message)

## Data structures

# Message
- message (string)

# OtherMessage
- otherMessage (string)