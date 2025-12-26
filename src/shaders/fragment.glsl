varying vec2 vUv;
varying float vVisibility;
varying vec4 vTextureCoords;

uniform sampler2D uWrapperTexture;
uniform sampler2D uAtlas;
uniform sampler2D uBlurryAtlas;

// Rounded rectangle SDF
float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main()
{
    // Create rounded rectangle mask
    vec2 center = vUv - 0.5;
    float cornerRadius = 0.08;
    float boxSize = 0.45;
    float dist = roundedBox(center, vec2(boxSize), cornerRadius);

    // Smooth edge with antialiasing
    float edge = 0.01;
    float alpha = 1.0 - smoothstep(-edge, edge, dist);

    if (alpha < 0.01) discard;

    // Get UV coordinates for this image from the atlas
    float xStart = vTextureCoords.x;
    float xEnd = vTextureCoords.y;
    float yStart = vTextureCoords.z;
    float yEnd = vTextureCoords.w;

    vec2 atlasUV = vec2(
        mix(xStart, xEnd, vUv.x),
        mix(yStart, yEnd, 1.0 - vUv.y)
    );

    // Sample the photo
    vec4 color = texture2D(uAtlas, atlasUV);

    // Apply visibility fade for depth
    color.a = alpha * vVisibility;

    // Add subtle border glow based on distance from edge
    float borderGlow = smoothstep(0.0, -0.03, dist);
    color.rgb = mix(color.rgb, color.rgb * 1.1, borderGlow * 0.3);

    gl_FragColor = color;
}
