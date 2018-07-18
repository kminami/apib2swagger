FORMAT: 1A

# Blog Posts [/posts]

## Retrieve All Posts [GET]
+ Request (application/json)
    + Attributes (array[BlogPost], fixed-type)

## Data Structures

### BlogPost (object)
+ id: 42 (number, required)
+ text: Hello World (string)
+ author (Author) - Author of the blog post.

### Author (object)
+ name: Boba Fett
+ email: fett@intergalactic.com
