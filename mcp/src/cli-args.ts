/** CLI subcommand parsing (pure — safe to unit test, unlike index.ts). */
export type Subcommand = "doctor" | "stop" | "install-plugin";

/**
 * Subcommand is argv[2] exactly — never `args.includes()`, which also
 * matched flag VALUES (e.g. `fimake --dir doctor` used to run the doctor).
 */
export function parseSubcommand(argv: string[]): Subcommand | undefined {
    const [first] = argv;
    if (first === "doctor" || first === "stop" || first === "install-plugin") return first;
    return undefined;
}
