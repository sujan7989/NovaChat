/**
 * @swagger
 * components:
 *   schemas:
 *     HealthResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, degraded, unhealthy]
 *           description: Overall health status
 *         uptime:
 *           type: number
 *           description: Server uptime in seconds
 *         timestamp:
 *           type: number
 *           description: Current timestamp
 *         version:
 *           type: string
 *           description: Application version
 *         checks:
 *           type: object
 *           properties:
 *             redis:
 *               type: string
 *               enum: [ok, error]
 *               description: Redis connection status
 *             memory:
 *               type: object
 *               description: Memory usage statistics
 *   
 *     StatsResponse:
 *       type: object
 *       properties:
 *         total_matches:
 *           type: integer
 *           description: Total number of matches made
 *         active_chats:
 *           type: integer
 *           description: Number of currently active chats
 *         online:
 *           type: integer
 *           description: Number of users currently online
 *         timestamp:
 *           type: number
 *           description: Current timestamp
 *   
 *     ConfigResponse:
 *       type: object
 *       properties:
 *         NODE_ENV:
 *           type: string
 *           description: Environment mode
 *         PORT:
 *           type: integer
 *           description: Server port
 *         RATE_LIMIT_WINDOW_MS:
 *           type: integer
 *           description: Rate limiting window in milliseconds
 *         RATE_LIMIT_MAX_REQUESTS:
 *           type: integer
 *           description: Maximum requests per window
 *         MAX_MESSAGE_SIZE:
 *           type: integer
 *           description: Maximum message size in characters
 *         MAX_IMAGE_SIZE:
 *           type: integer
 *           description: Maximum image size in bytes
 *         MESSAGE_RATE_LIMIT:
 *           type: integer
 *           description: Maximum messages per rate window
 *         MESSAGE_RATE_WINDOW:
 *           type: integer
 *           description: Message rate window in milliseconds
 *         REPORT_BAN_THRESHOLD:
 *           type: integer
 *           description: Number of reports before ban
 *         MAX_INTERESTS:
 *           type: integer
 *           description: Maximum number of interests
 *         MAX_LANGUAGES:
 *           type: integer
 *           description: Maximum number of languages
 *         MAX_VIBES:
 *           type: integer
 *           description: Maximum number of vibes
 *   
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 *         details:
 *           type: string
 *           description: Additional error details (optional)
 *   
 *     FindPayload:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         userId:
 *           type: string
 *           pattern: '^[a-zA-Z0-9_-]{8,64}$'
 *           description: User identifier (8-64 alphanumeric characters)
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: User gender
 *         pref:
 *           type: string
 *           enum: [male, female, any]
 *           description: Gender preference for matching
 *         interests:
 *           type: array
 *           items:
 *             type: string
 *             maxLength: 50
 *           maxItems: 10
 *           description: User interests
 *         languages:
 *           type: array
 *           items:
 *             type: string
 *             pattern: '^[a-z]{2}(-[A-Z]{2})?$'
 *           maxItems: 5
 *           description: User languages
 *         vibes:
 *           type: array
 *           items:
 *             type: string
 *             maxLength: 30
 *           maxItems: 5
 *           description: User vibes
 *   
 *     MessagePayload:
 *       type: object
 *       required:
 *         - userId
 *         - text
 *       properties:
 *         userId:
 *           type: string
 *           pattern: '^[a-zA-Z0-9_-]{8,64}$'
 *           description: User identifier
 *         text:
 *           type: string
 *           maxLength: 500
 *           description: Message content
 *   
 *     ImagePayload:
 *       type: object
 *       required:
 *         - userId
 *         - dataUrl
 *       properties:
 *         userId:
 *           type: string
 *           pattern: '^[a-zA-Z0-9_-]{8,64}$'
 *           description: User identifier
 *         dataUrl:
 *           type: string
 *           pattern: '^data:image/[^;]+;base64,'
 *           description: Base64 encoded image data
 *         caption:
 *           type: string
 *           maxLength: 200
 *           description: Image caption (optional)
 *   
 *     TypingPayload:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         userId:
 *           type: string
 *           pattern: '^[a-zA-Z0-9_-]{8,64}$'
 *           description: User identifier
 *         isTyping:
 *           type: boolean
 *           description: Whether user is typing
 *   
 *     UserIdPayload:
 *       type: object
 *       required:
 *         - userId
 *       properties:
 *         userId:
 *           type: string
 *           pattern: '^[a-zA-Z0-9_-]{8,64}$'
 *           description: User identifier
 *   
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   
 *   examples:
 *     FindRequest:
 *       summary: Example find request
 *       value:
 *         userId: "user-12345678"
 *         gender: "male"
 *         pref: "female"
 *         interests: ["gaming", "music", "movies"]
 *         languages: ["en", "es"]
 *         vibes: ["chill", "friendly"]
 *     
 *     MessageRequest:
 *       summary: Example message request
 *       value:
 *         userId: "user-12345678"
 *         text: "Hello! How are you?"
 *     
 *     ImageRequest:
 *       summary: Example image request
 *       value:
 *         userId: "user-12345678"
 *         dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
 *         caption: "Check out this cute cat!"
 */

export default {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NovaChat API',
      version: '1.0.0',
      description: 'Modern anonymous chat platform API with real-time messaging and video calling',
      contact: {
        name: 'NovaChat Support',
        email: 'support@novachat.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      },
      {
        url: 'https://api.novachat.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and monitoring endpoints'
      },
      {
        name: 'Stats',
        description: 'Platform statistics and metrics'
      },
      {
        name: 'Config',
        description: 'Public configuration'
      }
    ]
  },
  apis: ['./src/*.js']
};
