/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GaxiosError } from 'gaxios';
import { useState, useEffect, useCallback } from 'react';
import { Config, CodeAssistServer, UserTierId } from '@google/gemini-cli-core';

export const usePrivacySettings = (config: Config) => {
  const [dataCollectionOptIn, setDataCollectionOptIn] = useState<
    boolean | undefined
  >(undefined);
  const [isFreeTier, setIsFreeTier] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDataCollectionOptIn = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const server = getCodeAssistServer(config);

      const newIsFreeTier = (await getTier(server)) === UserTierId.FREE;
      setIsFreeTier(newIsFreeTier);
      if (!newIsFreeTier) {
        // We don't need to fetch opt-out info since non-free tier
        // data gathering is already worked out some other way.
        return;
      }

      const optIn = await getRemoteDataCollectionOptIn(server);
      setDataCollectionOptIn(optIn);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  useEffect(() => {
    fetchDataCollectionOptIn();
  }, [fetchDataCollectionOptIn]);

  const updateDataCollectionOptIn = useCallback(
    async (optIn: boolean) => {
      try {
        const server = getCodeAssistServer(config);
        const updatedOptIn = await setRemoteDataCollectionOptIn(server, optIn);
        setDataCollectionOptIn(updatedOptIn);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [config],
  );

  return {
    isLoading,
    error,
    isFreeTier,
    dataCollectionOptIn,
    updateDataCollectionOptIn,
  };
};

function getCodeAssistServer(config: Config): CodeAssistServer {
  const server = config.getGeminiClient().getContentGenerator();
  if (!(server instanceof CodeAssistServer)) {
    throw new Error('Oauth not being used');
  } else if (!server.projectId) {
    throw new Error('Oauth not being used');
  }
  return server;
}

async function getTier(server: CodeAssistServer): Promise<UserTierId> {
  const loadRes = await server.loadCodeAssist({
    cloudaicompanionProject: server.projectId,
    metadata: {
      ideType: 'IDE_UNSPECIFIED',
      platform: 'PLATFORM_UNSPECIFIED',
      pluginType: 'GEMINI',
      duetProject: server.projectId,
    },
  });
  if (!loadRes.currentTier) {
    throw new Error('User does not have a current tier');
  }
  return loadRes.currentTier.id;
}

async function getRemoteDataCollectionOptIn(
  server: CodeAssistServer,
): Promise<boolean> {
  try {
    const resp = await server.getCodeAssistGlobalUserSetting({
      cloudaicompanionProject: server.projectId,
    });
    return resp.freeTierDataCollectionOptin;
  } catch (e) {
    if (e instanceof GaxiosError) {
      if (e.response?.status === 404) {
        return true;
      }
    }
    throw e;
  }
}

async function setRemoteDataCollectionOptIn(
  server: CodeAssistServer,
  optIn: boolean,
): Promise<boolean> {
  const resp = await server.setCodeAssistGlobalUserSetting({
    cloudaicompanionProject: server.projectId,
    freeTierDataCollectionOptin: optIn,
  });
  return resp.freeTierDataCollectionOptin;
}
