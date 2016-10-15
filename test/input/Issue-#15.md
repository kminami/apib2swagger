MAT: 1A
HOST: http://example:8000/__api__

# API Documentation
This is a reference document explaining the API. Please note that paths are relative to the base API url (ie `http://example:8000/__api__/`)

# Group Settings
## Server Settings [/server_settings]

Get server settings

## Get Server Settings [GET]
+ Response 200 (application/json)

    + Attributes
        + version: software version (string, required)
        + build: software build (string, required)

# Group Users
Get, update, and delete users

## Users [/users]

### List all users [GET]
Get a list of all users. Optionally, you can specify a `prefix` to search for a specific user.

+ prefix (string - The prefix of a user (username, first name, or last name)

+ Response 200 (application/json)

    + Attributes (array[User])

### User Detail [/users/{user_id}]

Get detailed information on a specific user

+ Parameters
    + user_id: p401 (string, required) - The ID of a specific user in the form of a string

### Get a specific user [GET]

+ Response 200 (application/json)
    
    + Attributes (UserDetail)

## Data Structures

### User
+ id: 1 (number, required) - unique numerical identified
+ principal_id: 1 (number, required) - unique numerical identified across users and groups 
+ provider_key: p401 (string) - unique identifier in string format 
+ email: chad@test.com (string) - email address 
+ email_hash: a51b767bfd8fccf9b5831a99e1f97c81 (string) - hashed email address
+ username: admin (string, required) - username of the user 
+ first_name: Chad (string) - the first name of the user 
+ last_name: Smith (string) - the last name of the user 
+ password: password (string) the password, usually blank
+ user_role: administrator (string, required) - the role of the user 
+ confirmed: true (boolean, required) - has the user been confirmed
+ locked: false (boolean, required) - is the user locked

### UserDetail (User)
+ privileges: ["add_users"] (array[string], required) - List of privileges the user has
