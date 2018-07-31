FORMAT: 1A

# Blog Post [/posts/{id}]
## Retrieve A Post [GET]

+ Parameters
    + id: `12345` (required, string)

+ Response 200 (application/json)
    + Attributes (array[BlogPost], fixed-type)


# Create Blog Posts [/posts]

## Create Post [POST]
+ Request (application/json)
    + Attributes (BlogPost, fixed-type)

+ Response 200 (application/json)


## Data Structures

### BlogPost (object)
+ id: 42 (number, required)
+ text: Hello World (string)
+ author (Author, fixed-type) - Author of the blog post.
+ editors (array[Editors], fixed-type)

### Author
+ name: Boba Fett (string, optional)
+ email: fett@intergalactic.com (string, optional)

### Editors (object)
+ name: Lando Calrissian (string, optional)
+ email: lando@intergalactic.com (string, optional)
