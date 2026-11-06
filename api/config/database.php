<?php
declare(strict_types=1);

/**
 * ScoolMeet | اسکول میت — MySQL PDO Database Connection (PHP 8.2+)
 * Loads environment variables from the project root .env file and establishes a PDO connection.
 */
final class Database
{
    private static ?PDO $instance = null;
    private static bool $envLoaded = false;

    /**
     * Load key=value pairs from the root .env file into PHP environment variables.
     */
    public static function loadEnv(?string $envFilePath = null): void
    {
        if (self::$envLoaded) {
            return;
        }

        $path = $envFilePath ?? dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env';
        if (!is_file($path) || !is_readable($path)) {
            self::$envLoaded = true;
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            self::$envLoaded = true;
            return;
        }

        foreach ($lines as $line) {
            $trimmed = trim($line);

            // Skip empty lines and comments
            if ($trimmed === '' || str_starts_with($trimmed, '#')) {
                continue;
            }

            $separatorPos = strpos($trimmed, '=');
            if ($separatorPos === false) {
                continue;
            }

            $key   = trim(substr($trimmed, 0, $separatorPos));
            $value = trim(substr($trimmed, $separatorPos + 1));

            if ($key === '') {
                continue;
            }

            // Strip surrounding quotes if present
            if (
                (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
                (str_starts_with($value, "'") && str_ends_with($value, "'"))
            ) {
                $value = substr($value, 1, -1);
            }

            $_ENV[$key]    = $value;
            $_SERVER[$key] = $value;
            putenv("{$key}={$value}");
        }

        self::$envLoaded = true;
    }

    /**
     * Read an environment variable with a fallback default.
     */
    private static function getEnvVar(string $key, string $default = ''): string
    {
        self::loadEnv();

        if (array_key_exists($key, $_ENV)) {
            return (string) $_ENV[$key];
        }

        if (array_key_exists($key, $_SERVER)) {
            return (string) $_SERVER[$key];
        }

        $val = getenv($key);
        if ($val !== false) {
            return (string) $val;
        }

        return $default;
    }

    /**
     * Establish and return a singleton PDO connection to the MySQL database.
     *
     * @throws PDOException if the connection fails.
     */
    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            self::loadEnv();

            $host     = self::getEnvVar('DB_HOST', '127.0.0.1');
            $port     = self::getEnvVar('DB_PORT', '3306');
            $database = self::getEnvVar('DB_DATABASE', 'scoolmeet_db');
            $username = self::getEnvVar('DB_USERNAME', 'root');
            $password = self::getEnvVar('DB_PASSWORD', '');

            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                $host,
                $port,
                $database
            );

            self::$instance = new PDO($dsn, $username, $password, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        }

        return self::$instance;
    }
}

