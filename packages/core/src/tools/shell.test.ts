/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ShellTool } from './shell.js';
import { Config, ApprovalMode } from '../config/config.js';
import {
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
} from './tools.js';

describe('ShellTool', () => {
  let tool: ShellTool;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getTargetDir: () => '/test/dir',
      getApprovalMode: vi.fn(),
      setApprovalMode: vi.fn(),
      isToolAllowedFor: vi.fn(),
      setToolAllowedFor: vi.fn(),
      getDebugMode: () => false,
      getSandbox: () => undefined,
      getGeminiClient: vi.fn(),
      getApiKey: () => 'test-key',
      getModel: () => 'test-model',
      getQuestion: () => undefined,
      getFullContext: () => false,
      getToolDiscoveryCommand: () => undefined,
      getToolCallCommand: () => undefined,
      getMcpServerCommand: () => undefined,
      getMcpServers: () => undefined,
      getUserAgent: () => 'test-agent',
      getUserMemory: () => '',
      setUserMemory: vi.fn(),
      getGeminiMdFileCount: () => 0,
      setGeminiMdFileCount: vi.fn(),
      getToolRegistry: vi.fn(),
    } as unknown as Config;

    // Reset mocks before each test
    (mockConfig.getApprovalMode as Mock).mockClear();
    (mockConfig.isToolAllowedFor as Mock).mockClear();
    (mockConfig.setToolAllowedFor as Mock).mockClear();
    (mockConfig.getApprovalMode as Mock).mockReturnValue(ApprovalMode.DEFAULT);
    (mockConfig.isToolAllowedFor as Mock).mockReturnValue(false);

    tool = new ShellTool(mockConfig);
  });

  describe('getCommandRoot', () => {
    it('should extract command root correctly', () => {
      expect(tool.getCommandRoot('ls -la')).toBe('ls');
      expect(tool.getCommandRoot('  npm install  ')).toBe('npm');
      expect(tool.getCommandRoot('git status && echo done')).toBe('git');
      expect(tool.getCommandRoot('/usr/bin/python3 script.py')).toBe('python3');
      expect(tool.getCommandRoot('')).toBe('');
    });
  });

  describe('validateToolParams', () => {
    it('should return error for empty command', () => {
      const result = tool.validateToolParams({ command: '' });
      expect(result).toBe('Command cannot be empty.');
    });

    it('should return null for valid command', () => {
      const result = tool.validateToolParams({ command: 'ls -la' });
      expect(result).toBeNull();
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return false if validation fails', async () => {
      const params = { command: '' };
      const result = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );
      expect(result).toBe(false);
    });

    it('should return false if command is already allowed', async () => {
      (mockConfig.isToolAllowedFor as Mock).mockReturnValue(true);

      const params = { command: 'ls -la' };
      const result = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );

      expect(result).toBe(false);
      expect(mockConfig.isToolAllowedFor).toHaveBeenCalledWith(tool, 'ls');
    });

    it('should return confirmation details for unallowed command', async () => {
      const params = { command: 'git status' };
      const result = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );

      expect(result).not.toBe(false);
      if (result && typeof result === 'object' && result.type === 'exec') {
        const execResult = result as ToolExecuteConfirmationDetails;
        expect(execResult.type).toBe('exec');
        expect(execResult.title).toBe('Confirm Shell Command');
        expect(execResult.command).toBe('git status');
        expect(execResult.rootCommand).toBe('git');
        expect(typeof execResult.onConfirm).toBe('function');
      }
    });
  });

  describe('allow always functionality', () => {
    it('should call setToolAllowedFor when onConfirm is called with ProceedAlways', async () => {
      const params = { command: 'npm install' };
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);

      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedAlways);
        expect(mockConfig.setToolAllowedFor).toHaveBeenCalledWith(tool, 'npm');
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should not call setToolAllowedFor when onConfirm is called with ProceedOnce', async () => {
      const params = { command: 'git status' };
      const confirmation = await tool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);

      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedOnce);
        expect(mockConfig.setToolAllowedFor).not.toHaveBeenCalled();
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should not add to allowlist when command is already allowed', async () => {
      (mockConfig.isToolAllowedFor as Mock).mockReturnValue(true);

      const params = { command: 'ls -la' };
      await tool.shouldConfirmExecute(params, new AbortController().signal);

      expect(mockConfig.setToolAllowedFor).not.toHaveBeenCalled();
    });

    it('should check allowlist with correct command root', async () => {
      const params = { command: '/usr/bin/python3 -m pip install package' };
      await tool.shouldConfirmExecute(params, new AbortController().signal);

      expect(mockConfig.isToolAllowedFor).toHaveBeenCalledWith(tool, 'python3');
    });
  });

  describe('getDescription', () => {
    it('should return command description', () => {
      const params = { command: 'ls -la' };
      const result = tool.getDescription(params);
      expect(result).toBe('ls -la');
    });

    it('should include directory in description', () => {
      const params = { command: 'npm install', directory: 'subfolder' };
      const result = tool.getDescription(params);
      expect(result).toBe('npm install [in subfolder]');
    });

    it('should include custom description', () => {
      const params = { command: 'git commit', description: 'Commit changes' };
      const result = tool.getDescription(params);
      expect(result).toBe('git commit (Commit changes)');
    });

    it('should include both directory and description', () => {
      const params = {
        command: 'npm test',
        directory: 'packages/core',
        description: 'Run tests for core package',
      };
      const result = tool.getDescription(params);
      expect(result).toBe(
        'npm test [in packages/core] (Run tests for core package)',
      );
    });
  });
});
