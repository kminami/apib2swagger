# Group Users

## A user [/user]

### Get one user [GET]
+ Response 200 (application/json)
  + Attributes (User)
+ Response 500 (application/json)

## Some users [/users]

### Post a user [POST]
+ Request (application/json)
  + Attributes(User)
+ Response 201 (application/json)
  + Attributes (User)
+ Response 500 (application/json)

### Get a collection of users [GET]
+ Response 200 (application/json)
  + Attributes (array[User])
+ Response 500 (application/json)

# Data Structures

## User (object)
+ id (string, required)
+ name (string, nullable, required)

## Users (object)
+ `users`(array[User], nullable, required)