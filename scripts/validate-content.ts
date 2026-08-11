import { runContentValidation } from '../src/lib/content-validation-command';

process.exitCode = await runContentValidation();
