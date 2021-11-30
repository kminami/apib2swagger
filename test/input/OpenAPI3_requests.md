HOST: https://www.testhost.com

# Some resource [GET /some/resource/{pathParam}{?queryParam}]
+ Parameters
    + pathParam: exampleValue (required, string)
        + Default: defaultValue
    + queryParam: value1 (required, enum[string])
        + Members
            + value1
            + value2
    + additionalQueryParam (string)

+ Request (application/json)
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

+ Request
    + Schema
        {
            "type": "object",
            "properties": {
                "message2": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

+ Request
    + Schema
        {
            "type": "object",
            "properties": {
                "message3": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

+ Request
    duplicate
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

+ Response 200 (application/json)

# Another resource [GET /another/resource/]
+ Request (application/json)
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

    + Body
        {
            "message1": "Hello world"
        }

+ Request (application/json)
    + Schema
        {
            "type": "object",
            "properties": {
                "message2": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }

    + Body
        {
            "message2": "Hello world"
        }

+ Response 200 (application/json)

# Some resource [GET /withAttributes]
+ Request (application/json)
    + Schema
        {
            "type": "object",
            "properties": {
                "someType": {
                    "type": "string",
                    "description": "This is the message description "
                }
            }
        }
    
+ Request (application/json)
    + Attributes (Message)

+ Response 200 (application/json) 

# Some resource [GET /onlyAttributes]
+ Attributes (Message)

+ Response 200 (application/json)


# Some resource [GET /onlyExamples]
+ Request (application/json)
    + Body
    {
        "message": "test1"
    }

+ Request (application/json)
    + Body
    {
        "message": "test2"
    }

+ Request (application/json)
    + Body
    {
        "message": "test3"
    }

+ Request (text/plain)
    + Body
        test

+ Response 200 (application/json)

# Some resource [GET /bodyOnly]
+ Request (application/json)
    + Body
    {
        "message": "test2"
    }

+ Response 200 (application/json)

## Data structures

# Message
- message (string)