import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getClientPromise(): Promise<MongoClient> {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI || '';
    if (!uri) {
      throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
    }
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  const client = await getClientPromise();
  const dbName = process.env.MONGODB_DB || 'koto';
  const db = client.db(dbName);
  return { client, db };
}

export default { getClientPromise };
