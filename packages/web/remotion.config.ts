import { Config } from '@remotion/cli/config';

Config.setEntryPoint('remotion/index.ts');
Config.setOverwriteOutput(true);
Config.setVideoImageFormat('jpeg');
Config.setStillImageFormat('png');

/**
 * Remotion needs a browser. Use the Chrome already installed on the machine
 * rather than downloading a second one; the env var wins when it is set.
 */
const BROWSER =
  process.env.REMOTION_BROWSER_EXECUTABLE ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
Config.setBrowserExecutable(BROWSER);
