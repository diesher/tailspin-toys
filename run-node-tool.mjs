import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , toolPath, ...toolArgs] = process.argv;

if (!toolPath) {
    console.error('Missing tool path. Usage: node run-node-tool.mjs <toolPath> [...args]');
    process.exit(1);
}

function parseVersionFromFolder(folderName) {
    const match = folderName.match(/^node-v(\d+)\.(\d+)\.(\d+)-win-x64$/);
    if (!match) {
        return null;
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(a, b) {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) {
            return b[i] - a[i];
        }
    }
    return 0;
}

function resolveWindowsArm64X64Node() {
    if (process.platform !== 'win32' || process.arch !== 'arm64') {
        return null;
    }

    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
        return null;
    }

    const packagesRoot = join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (!existsSync(packagesRoot)) {
        return null;
    }

    const packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => name.startsWith('OpenJS.NodeJS.'));

    const candidates = [];
    for (const packageDir of packageDirs) {
        const packagePath = join(packagesRoot, packageDir);
        for (const entry of readdirSync(packagePath, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const version = parseVersionFromFolder(entry.name);
            if (!version) {
                continue;
            }
            const nodePath = join(packagePath, entry.name, 'node.exe');
            if (existsSync(nodePath)) {
                candidates.push({ nodePath, version });
            }
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    candidates.sort((left, right) => compareVersion(left.version, right.version));
    return candidates[0].nodePath;
}

const x64Node = resolveWindowsArm64X64Node();
const runtimeNode = x64Node ?? process.execPath;
const runtimeDir = dirname(runtimeNode);

const result = spawnSync(runtimeNode, [toolPath, ...toolArgs], {
    stdio: 'inherit',
    env: {
        ...process.env,
        PATH: process.platform === 'win32' ? `${runtimeDir};${process.env.PATH ?? ''}` : process.env.PATH,
    },
});

if (typeof result.status === 'number') {
    process.exit(result.status);
}

if (result.error) {
    console.error(result.error);
}
process.exit(1);
