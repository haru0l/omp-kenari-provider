import type { ToolDefinition } from "@oh-my-pi/pi-coding-agent";
declare const generateImageParams: import("@oh-my-pi/omptype/typebox").TObject<{
    readonly prompt: import("@oh-my-pi/omptype/typebox").TString;
    readonly model: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TString>;
    readonly n: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TNumber>;
    readonly size: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TString>;
    readonly quality: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TUnion<readonly [import("@oh-my-pi/omptype/typebox").TLiteral<"standard">, import("@oh-my-pi/omptype/typebox").TLiteral<"hd">]>>;
    readonly style: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TUnion<readonly [import("@oh-my-pi/omptype/typebox").TLiteral<"natural">, import("@oh-my-pi/omptype/typebox").TLiteral<"vivid">]>>;
    readonly background: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TUnion<readonly [import("@oh-my-pi/omptype/typebox").TLiteral<"opaque">, import("@oh-my-pi/omptype/typebox").TLiteral<"auto">]>>;
    readonly output: import("@oh-my-pi/omptype/typebox").TOptional<import("@oh-my-pi/omptype/typebox").TString>;
}>;
export interface GenerateImageDetails {
    model: string;
    prompt: string;
    /** Files written, relative to the working directory. */
    files: string[];
    /** Bytes written per file, in the same order. */
    bytes: number[];
    /** Per-image rewrite of the prompt, when the model returns one. */
    revisedPrompts: string[];
}
/**
 * The `generate_image` tool. It reads kenari credentials from the model
 * registry rather than holding a key of its own.
 */
export declare const generateImageTool: ToolDefinition<typeof generateImageParams, GenerateImageDetails>;
export {};
//# sourceMappingURL=image.d.ts.map