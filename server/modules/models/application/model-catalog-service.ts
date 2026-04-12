import type {
  SessionImportModelRequest,
  SessionImportModelResponse,
} from '../../../../src/shared/codex-session-types.js';
import type { ModelStorage } from '../infrastructure/model-storage.js';
import type { ModelRecord, ModelRegistry } from '../infrastructure/model-registry.js';

export type ModelCatalogService = {
  importModel(
    request: SessionImportModelRequest,
  ): Promise<SessionImportModelResponse & { record: ModelRecord }>;
  readModelFile(modelId: string): Promise<Buffer | null>;
};

export function createModelCatalogService(options: {
  modelRegistry: ModelRegistry;
  modelStorage: ModelStorage;
}): ModelCatalogService {
  return {
    async importModel(request) {
      const fileBuffer = Buffer.from(request.fileContentBase64, 'base64');
      const model = options.modelRegistry.registerImportedModel({
        sourceFileName: request.fileName,
      });
      await options.modelStorage.writeModelFile(model.storagePath, fileBuffer);

      return {
        modelId: model.modelId,
        modelLabel: model.sourceFileName,
        record: model,
      };
    },
    async readModelFile(modelId) {
      const model = options.modelRegistry.getModel(modelId);
      if (!model) {
        return null;
      }

      return options.modelStorage.readModelFile(model.storagePath);
    },
  };
}
