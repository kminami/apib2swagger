# Group Users

## A user [/user]

### Get one user [GET]
+ Response 200 (application/json)
  + Attributes (User)

# Data Structures

## Address (object)
+ street (string)

## Base (object)
+ name (string)

## Named (Base)
+ nickname (string)

## User (object)
+ id (string, required)
+ nickname (string, nullable)
+ homeAddress (Address, nullable) - The home address
+ named (Named, nullable)
+ tags (array[Named], nullable)
