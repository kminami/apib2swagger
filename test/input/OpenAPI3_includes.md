HOST: https://www.testhost.com

# Some resource [GET /some/resource]
+ Request (application/json)
    + Body
        <!-- include(./includes/resource-request-body.json) --> 
    + Schema
        <!-- include(./includes/resource-request-schema.json --> 

+ Request (application/json)
    + Body
        <!-- include(./includes/resource-request-body-2.json) --> 

+ Response 200 (application/json)
    + Body
        <!-- include: ./includes/resource-response-body.json -->  
    + Schema
        <!-- include: ./includes/resource-response-schema.json --> 

+ Response 200 (application/json)
    + Body
        <!-- include ( ./includes/resource-response-body-2.json -->  