const nullableStringSchema = {
  type: ['string', 'null'],
} as const;

export const sessionMessageBodySchema = {
  type: 'object',
  required: ['sessionId', 'activeModelId', 'message', 'selectionContext', 'viewContext'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
    activeModelId: nullableStringSchema,
    message: {
      type: 'object',
      required: ['role', 'text'],
      additionalProperties: false,
      properties: {
        role: { type: 'string', enum: ['user'] },
        text: { type: 'string' },
      },
    },
    selectionContext: {
      type: 'object',
      required: ['mode', 'triangleIds', 'components'],
      additionalProperties: true,
      properties: {
        mode: { type: 'string' },
        triangleIds: { type: 'array' },
        components: { type: 'array' },
      },
    },
    viewContext: {
      type: 'object',
      required: [
        'cameraPosition',
        'target',
        'up',
        'fov',
        'viewDirection',
        'dominantOrientation',
        'viewportSize',
      ],
      additionalProperties: true,
      properties: {
        cameraPosition: { type: 'array' },
        target: { type: 'array' },
        up: { type: 'array' },
        fov: { type: 'number' },
        viewDirection: { type: 'array' },
        dominantOrientation: { type: 'string' },
        viewportSize: { type: 'array' },
      },
    },
  },
} as const;

export const sessionDecisionBodySchema = {
  type: 'object',
  required: ['sessionId', 'decisionId', 'answers'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
    decisionId: { type: 'string' },
    answers: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
} as const;

export const sessionGenerateModelBodySchema = {
  type: 'object',
  required: ['sessionId'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
  },
} as const;

export const sessionInterruptBodySchema = {
  type: 'object',
  required: ['sessionId'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
  },
} as const;

export const sessionModelSwitchBodySchema = {
  type: 'object',
  required: ['sessionId', 'activeModelId', 'modelLabel'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
    activeModelId: nullableStringSchema,
    modelLabel: nullableStringSchema,
  },
} as const;

export const sessionClearBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const;

export const modelImportBodySchema = {
  type: 'object',
  required: ['sessionId', 'fileName', 'fileContentBase64'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string' },
    fileName: { type: 'string' },
    fileContentBase64: { type: 'string' },
  },
} as const;
