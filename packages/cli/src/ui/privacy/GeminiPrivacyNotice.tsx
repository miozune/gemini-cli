/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text, useInput } from 'ink';

interface GeminiPrivacyNoticeProps {
  onExit: () => void;
}

export const GeminiPrivacyNotice = ({ onExit }: GeminiPrivacyNoticeProps) => {
  useInput((input, key) => {
    if (key.escape) {
      onExit();
    }
  });

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="center">
        <Text bold>Gemini API Key Notice</Text>
      </Box>
      <Newline />
      <Text>
        By using the Gemini API<Text color="red">[1]</Text>, Google AI Studio
        <Text color="blue">[2]</Text>, and the other Google developer services
        that reference these terms (collectively, the &quot;APIs&quot; or
        &quot;Services&quot;), you are agreeing to Google APIs Terms of Service
        (the &quot;API Terms&quot;)
        <Text color="green">[3]</Text>, and the Gemini API Additional Terms of
        Service (the &quot;Additional Terms&quot;)
        <Text color="magenta">[4]</Text>.
      </Text>
      <Newline />
      <Text>
        <Text color="red">[1]</Text>{' '}
        https://ai.google.dev/docs/gemini_api_overview
      </Text>
      <Text>
        <Text color="blue">[2]</Text> https://aistudio.google.com/
      </Text>
      <Text>
        <Text color="green">[3]</Text> https://developers.google.com/terms
      </Text>
      <Text>
        <Text color="magenta">[4]</Text> https://ai.google.dev/gemini-api/terms
      </Text>
    </Box>
  );
};
