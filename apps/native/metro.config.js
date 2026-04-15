// Metro config — 모노레po에서 packages/* 해석용.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 모노레포 루트까지 watch (packages/core 변경 감지용)
config.watchFolders = [workspaceRoot];

// 양쪽 node_modules에서 의존성 해석
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 심볼릭 링크 지원 (npm workspaces의 내부 링크 처리)
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
