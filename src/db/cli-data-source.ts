import { loadEnv } from '../config/env.js';
import { createDataSource } from './data-source.js';

export default createDataSource(loadEnv().DATABASE_URL);
