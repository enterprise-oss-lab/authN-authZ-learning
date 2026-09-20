import { readFile, writeFile } from 'node:fs/promises';
import { OpenFgaClient } from '@openfga/sdk';
import dotenv from 'dotenv';

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizedJson);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== null && child !== '')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizedJson(child)]),
    );
  }

  return value;
}

async function main() {
  const envPath = new URL('../.env', import.meta.url);
  const modelPath = new URL('../infra/openfga/model.json', import.meta.url);
  const storeName = 'auth-learning';

  dotenv.config({ path: envPath });

  const apiUrl = process.env.OPENFGA_API_URL;
  if (!apiUrl) {
    throw new Error('OPENFGA_API_URL must be set in .env.');
  }

  const model = JSON.parse(await readFile(modelPath, 'utf8'));
  const rootClient = new OpenFgaClient({ apiUrl });

  const stores = await rootClient.listStores({ pageSize: 100 });
  const existingStore = stores.stores.find((store) => store.name === storeName);
  const storeId = existingStore?.id ?? (await rootClient.createStore({ name: storeName })).id;

  if (!storeId) {
    throw new Error('OpenFGA did not return a store ID.');
  }

  const storeClient = new OpenFgaClient({ apiUrl, storeId });
  const existingModels = await storeClient.readAuthorizationModels({ pageSize: 100 });
  const matchingModel = existingModels.authorization_models.find(
    (candidate) =>
      JSON.stringify(normalizedJson(candidate.type_definitions)) ===
      JSON.stringify(normalizedJson(model.type_definitions)),
  );

  const authorizationModelId =
    matchingModel?.id ?? (await storeClient.writeAuthorizationModel(model)).authorization_model_id;

  if (!authorizationModelId) {
    throw new Error('OpenFGA did not return an authorization model ID.');
  }

  const envFile = await readFile(envPath, 'utf8');
  const setEnv = (content: string, key: string, value: string) => {
    const line = `${key}=${value}`;
    const expression = new RegExp(`^${key}=.*$`, 'm');
    return expression.test(content)
      ? content.replace(expression, line)
      : `${content.trimEnd()}\n${line}\n`;
  };

  const withStoreId = setEnv(envFile, 'OPENFGA_STORE_ID', storeId);
  const updatedEnv = setEnv(
    withStoreId,
    'OPENFGA_AUTHORIZATION_MODEL_ID',
    authorizationModelId,
  );

  await writeFile(envPath, updatedEnv);

  console.log(`OpenFGA store: ${storeId}`);
  console.log(`OpenFGA authorization model: ${authorizationModelId}`);
}

void main();
