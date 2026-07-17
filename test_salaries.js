import { apiClient } from './src/api/apiClient.js';
apiClient('/salaries?limit=1').then(res => console.log(JSON.stringify(res, null, 2))).catch(err => console.error(err));
