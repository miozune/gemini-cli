/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  Mocked,
} from 'vitest';
import { DiscoveredMCPTool } from './mcp-tool.js'; // Added getStringifiedResultForDisplay
import { ToolResult, ToolConfirmationOutcome } from './tools.js'; // Added ToolConfirmationOutcome
import { CallableTool, Part } from '@google/genai';
import { Config } from '../config/config.js';

// Mock @google/genai mcpToTool and CallableTool
// We only need to mock the parts of CallableTool that DiscoveredMCPTool uses.
const mockCallTool = vi.fn();
const mockToolMethod = vi.fn();

const mockCallableToolInstance: Mocked<CallableTool> = {
  tool: mockToolMethod as any, // Not directly used by DiscoveredMCPTool instance methods
  callTool: mockCallTool as any,
  // Add other methods if DiscoveredMCPTool starts using them
};

const mockConfig = {
  isToolAllowedFor: vi.fn(),
  setToolAllowedFor: vi.fn(),
} as Partial<Config> as Config;

describe('DiscoveredMCPTool', () => {
  const serverName = 'mock-mcp-server';
  const toolNameForModel = 'test-mcp-tool-for-model';
  const serverToolName = 'actual-server-tool-name';
  const baseDescription = 'A test MCP tool.';
  const inputSchema: Record<string, unknown> = {
    type: 'object' as const,
    properties: { param: { type: 'string' } },
    required: ['param'],
  };

  beforeEach(() => {
    mockCallTool.mockClear();
    mockToolMethod.mockClear();
    vi.mocked(mockConfig.isToolAllowedFor).mockClear();
    vi.mocked(mockConfig.setToolAllowedFor).mockClear();
    vi.mocked(mockConfig.isToolAllowedFor).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should set properties correctly (non-generic server)', () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName, // serverName is 'mock-mcp-server', not 'mcp'
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );

      expect(tool.name).toBe(toolNameForModel);
      expect(tool.schema.name).toBe(toolNameForModel);
      expect(tool.schema.description).toBe(baseDescription);
      expect(tool.schema.parameters).toEqual(inputSchema);
      expect(tool.serverToolName).toBe(serverToolName);
      expect(tool.timeout).toBeUndefined();
    });

    it('should set properties correctly (generic "mcp" server)', () => {
      const genericServerName = 'mcp';
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        genericServerName, // serverName is 'mcp'
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      expect(tool.schema.description).toBe(baseDescription);
    });

    it('should accept and store a custom timeout', () => {
      const customTimeout = 5000;
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        undefined,
        customTimeout,
      );
      expect(tool.timeout).toBe(customTimeout);
    });
  });

  describe('execute', () => {
    it('should call mcpTool.callTool with correct parameters and format display output', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'testValue' };
      const mockToolSuccessResultObject = {
        success: true,
        details: 'executed',
      };
      const mockFunctionResponseContent: Part[] = [
        { text: JSON.stringify(mockToolSuccessResultObject) },
      ];
      const mockMcpToolResponseParts: Part[] = [
        {
          functionResponse: {
            name: serverToolName,
            response: { content: mockFunctionResponseContent },
          },
        },
      ];
      mockCallTool.mockResolvedValue(mockMcpToolResponseParts);

      const toolResult: ToolResult = await tool.execute(params);

      expect(mockCallTool).toHaveBeenCalledWith([
        { name: serverToolName, args: params },
      ]);
      expect(toolResult.llmContent).toEqual(mockMcpToolResponseParts);

      const stringifiedResponseContent = JSON.stringify(
        mockToolSuccessResultObject,
      );
      expect(toolResult.returnDisplay).toBe(stringifiedResponseContent);
    });

    it('should handle empty result from getStringifiedResultForDisplay', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'testValue' };
      const mockMcpToolResponsePartsEmpty: Part[] = [];
      mockCallTool.mockResolvedValue(mockMcpToolResponsePartsEmpty);
      const toolResult: ToolResult = await tool.execute(params);
      expect(toolResult.returnDisplay).toBe('```json\n[]\n```');
    });

    it('should propagate rejection if mcpTool.callTool rejects', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const params = { param: 'failCase' };
      const expectedError = new Error('MCP call failed');
      mockCallTool.mockRejectedValue(expectedError);

      await expect(tool.execute(params)).rejects.toThrow(expectedError);
    });
  });

  describe('shouldConfirmExecute', () => {
    // beforeEach is already clearing allowlist

    it('should return false if trust is true', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        undefined,
        undefined,
        true,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
    });

    it('should return false if server is always allowed', async () => {
      vi.mocked(mockConfig.isToolAllowedFor).mockReturnValue(true);
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
      expect(mockConfig.isToolAllowedFor).toHaveBeenCalledWith(
        'mcp',
        serverName,
      );
    });

    it('should return false if tool is always allowed', async () => {
      const toolAllowKey = `${serverName}.${serverToolName}`;
      vi.mocked(mockConfig.isToolAllowedFor).mockImplementation(
        (tool, entry) => entry === toolAllowKey,
      );
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );
      expect(
        await tool.shouldConfirmExecute({}, new AbortController().signal),
      ).toBe(false);
      expect(mockConfig.isToolAllowedFor).toHaveBeenCalledWith(
        'mcp',
        toolAllowKey,
      );
    });

    it('should return confirmation details if not trusted and not always allowed', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (confirmation && confirmation.type === 'mcp') {
        // Type guard for ToolMcpConfirmationDetails
        expect(confirmation.type).toBe('mcp');
        expect(confirmation.serverName).toBe(serverName);
        expect(confirmation.toolName).toBe(serverToolName);
      } else if (confirmation) {
        // Handle other possible confirmation types if necessary, or strengthen test if only MCP is expected
        throw new Error(
          'Confirmation was not of expected type MCP or was false',
        );
      } else {
        throw new Error(
          'Confirmation details not in expected format or was false',
        );
      }
    });
  });

  describe('allow always functionality', () => {
    it('should add server to allow list when onConfirm is called with ProceedAlwaysServer', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(
          ToolConfirmationOutcome.ProceedAlwaysServer,
        );
        expect(mockConfig.setToolAllowedFor).toHaveBeenCalledWith(
          'mcp',
          serverName,
        );
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should add tool to allow list when onConfirm is called with ProceedAlwaysTool', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );
      const toolAllowKey = `${serverName}.${serverToolName}`;
      const confirmation = await tool.shouldConfirmExecute(
        {},
        new AbortController().signal,
      );
      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        'onConfirm' in confirmation &&
        typeof confirmation.onConfirm === 'function'
      ) {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedAlwaysTool);
        expect(mockConfig.setToolAllowedFor).toHaveBeenCalledWith(
          'mcp',
          toolAllowKey,
        );
      } else {
        throw new Error(
          'Confirmation details or onConfirm not in expected format',
        );
      }
    });

    it('should not add to allow list when onConfirm is called with ProceedOnce', async () => {
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );
      const confirmation = await tool.shouldConfirmExecute(
        {},
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

    it('should not add to allow list when server is already always allowed', async () => {
      vi.mocked(mockConfig.isToolAllowedFor).mockReturnValue(true);
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );

      await tool.shouldConfirmExecute({}, new AbortController().signal);
      expect(mockConfig.setToolAllowedFor).not.toHaveBeenCalled();
    });

    it('should not add to allow list when tool is already always allowed', async () => {
      const toolAllowKey = `${serverName}.${serverToolName}`;
      vi.mocked(mockConfig.isToolAllowedFor).mockImplementation(
        (tool, entry) => entry === toolAllowKey,
      );
      const tool = new DiscoveredMCPTool(
        mockCallableToolInstance,
        serverName,
        toolNameForModel,
        baseDescription,
        inputSchema,
        serverToolName,
        mockConfig,
      );

      await tool.shouldConfirmExecute({}, new AbortController().signal);
      expect(mockConfig.setToolAllowedFor).not.toHaveBeenCalled();
    });
  });
});
