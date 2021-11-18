HOST: https://www.testhost.com

# Some resource [GET /object]
+ Request (application/json)

+ Response 200 (application/json)
    + Attributes (object)
        + message (string)

+ Response 200 (application/json)
    + Attributes (OtherMessage)

# Some resource [POST /array/object]
+ Request (application/json)
    + Attributes (Message)

+ Response 200 (application/json) 
    + Attributes (array, fixed-type)
        + (object)
            + path: `/files` (required)
            + otherMessage (OtherMessage)
        
# Some resource [GET /messages]
+ Request (application/json)

+ Response 200 (application/json)
    + Attributes (array[Message], fixed-type)

## Data structures

# Message
- message (string)

# OtherMessage
- otherMessage (string)
- someNum (number)