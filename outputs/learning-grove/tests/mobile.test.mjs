import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('mobile transactions, reading during generation, stale-result protection',()=>{execFileSync(process.execPath,['tests/mobile-fixture.cjs'],{stdio:'inherit',timeout:10000});});
