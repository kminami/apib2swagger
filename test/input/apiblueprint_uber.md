FORMAT: 1A

# Uber API

Move your app forward with the Uber API

## Group Products

#### Product Types [GET /v1/products]

The Products endpoint returns information about the *Uber* products
offered at a given location. The response includes the display name
and other details about each product, and lists the products in the
proper display order.

+ Parameters

    + latitude (required)
    
    + longitude (required)

+ Response 200

    An array of products

    + Body

    + Schema

            {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "product_id": {
                    "type": "string",
                    "description": "Unique identifier representing a specific product for a given latitude & longitude. For example, uberX in San Francisco will have a different product_id than uberX in Los Angeles."
                  },
                  "description": {
                    "type": "string",
                    "description": "Description of product."
                  },
                  "display_name": {
                    "type": "string",
                    "description": "Display name of product."
                  },
                  "capacity": {
                    "type": "string",
                    "description": "Capacity of product. For example, 4 people."
                  },
                  "image": {
                    "type": "string",
                    "description": "Image URL representing the product."
                  }
                }
              }
            }

## Group Estimates

#### Price Estimates [GET /v1/estimates/price]

The Price Estimates endpoint returns an estimated price range
for each product offered at a given location. The price estimate is
provided as a formatted string with the full price range and the localized
currency symbol.<br><br>The response also includes low and high estimates,
and the [ISO 4217](http://en.wikipedia.org/wiki/ISO_4217) currency code for
situations requiring currency conversion. When surge is active for a particular
product, its surge_multiplier will be greater than 1, but the price estimate
already factors in this multiplier.

+ Parameters

    + start_latitude (required)
    
    + start_longitude (required)
    
    + end_latitude (required)
    
    + end_longitude (required)

+ Response 200

    An array of price estimates by product

    + Body

    + Schema

            {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "product_id": {
                    "type": "string",
                    "description": "Unique identifier representing a specific product for a given latitude & longitude. For example, uberX in San Francisco will have a different product_id than uberX in Los Angeles"
                  },
                  "currency_code": {
                    "type": "string",
                    "description": "[ISO 4217](http://en.wikipedia.org/wiki/ISO_4217) currency code."
                  },
                  "display_name": {
                    "type": "string",
                    "description": "Display name of product."
                  },
                  "estimate": {
                    "type": "string",
                    "description": "Formatted string of estimate in local currency of the start location. Estimate could be a range, a single number (flat rate) or \"Metered\" for TAXI."
                  },
                  "low_estimate": {
                    "type": "number",
                    "description": "Lower bound of the estimated price."
                  },
                  "high_estimate": {
                    "type": "number",
                    "description": "Upper bound of the estimated price."
                  },
                  "surge_multiplier": {
                    "type": "number",
                    "description": "Expected surge multiplier. Surge is active if surge_multiplier is greater than 1. Price estimate already factors in the surge multiplier."
                  }
                }
              }
            }

#### Time Estimates [GET /v1/estimates/time]

The Time Estimates endpoint returns ETAs for all products offered at a given location, with the responses expressed as integers in seconds. We recommend that this endpoint be called every minute to provide the most accurate, up-to-date ETAs.

+ Parameters

    + start_latitude (required)
    
    + start_longitude (required)
    
    + customer_uuid
    
    + product_id

+ Response 200

    An array of products

    + Body

    + Schema

            {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "product_id": {
                    "type": "string",
                    "description": "Unique identifier representing a specific product for a given latitude & longitude. For example, uberX in San Francisco will have a different product_id than uberX in Los Angeles."
                  },
                  "description": {
                    "type": "string",
                    "description": "Description of product."
                  },
                  "display_name": {
                    "type": "string",
                    "description": "Display name of product."
                  },
                  "capacity": {
                    "type": "string",
                    "description": "Capacity of product. For example, 4 people."
                  },
                  "image": {
                    "type": "string",
                    "description": "Image URL representing the product."
                  }
                }
              }
            }

## Group User

### /v1/me

#### User Profile [GET]

The User Profile endpoint returns information about the Uber user that has authorized with the application.

+ Response 200

    Profile information for a user

    + Body

    + Schema

            {
              "type": "object",
              "properties": {
                "first_name": {
                  "type": "string",
                  "description": "First name of the Uber user."
                },
                "last_name": {
                  "type": "string",
                  "description": "Last name of the Uber user."
                },
                "email": {
                  "type": "string",
                  "description": "Email address of the Uber user"
                },
                "picture": {
                  "type": "string",
                  "description": "Image URL of the Uber user."
                },
                "promo_code": {
                  "type": "string",
                  "description": "Promo code of the Uber user."
                }
              }
            }

#### User Activity [GET /v1/history]

The User Activity endpoint returns data about a user's lifetime activity with Uber. The response will include pickup locations and times, dropoff locations and times, the distance of past requests, and information about which products were requested.<br><br>The history array in the response will have a maximum length based on the limit parameter. The response value count may exceed limit, therefore subsequent API requests may be necessary.

+ Parameters

    + offset
    
    + limit

+ Response 200

    History information for the given user

    + Body

    + Schema

            {
              "type": "object",
              "properties": {
                "offset": {
                  "type": "integer",
                  "format": "int32",
                  "description": "Position in pagination."
                },
                "limit": {
                  "type": "integer",
                  "format": "int32",
                  "description": "Number of items to retrieve (100 max)."
                },
                "count": {
                  "type": "integer",
                  "format": "int32",
                  "description": "Total number of items available."
                },
                "history": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "uuid": {
                        "type": "string",
                        "description": "Unique identifier for the activity"
                      }
                    }
                  }
                }
              }
            }

