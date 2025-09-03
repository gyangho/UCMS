const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

async function execCommand(command, options = {}) {
  try {
    // Windows 환경에서 명령어 실행을 위한 shell 옵션 추가
    const execOptions = {
      cwd: options.cwd || process.cwd(),
      timeout: options.timeout || 30000, // 30초 타임아웃
      shell: process.platform === "win32" ? "cmd.exe" : undefined,
      maxBuffer: options.maxBuffer || 1024 * 1024 * 10, // 10MB 버퍼 (기본값)
      ...options,
    };

    const { stdout, stderr } = await execAsync(command, execOptions);

    if (stderr && !options.ignoreStderr) {
      console.warn("Command stderr:", stderr);
    }

    return { success: true, stdout, stderr };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
    };
  }
}

// 특정 디렉토리에서 명령 실행
async function execInDirectory(command, directory, options = {}) {
  return execCommand(command, { ...options, cwd: directory });
}

// JSON 출력을 파싱하여 반환
async function execAndParseJson(command, options = {}) {
  const result = await execCommand(command, options);

  if (!result.success) {
    throw new Error(`Command failed: ${result.error}`);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (parseError) {
    throw new Error(
      `Failed to parse JSON output: ${parseError.message}`
    );
  }
}

module.exports = {
  execCommand,
  execInDirectory,
  execAndParseJson,
};
