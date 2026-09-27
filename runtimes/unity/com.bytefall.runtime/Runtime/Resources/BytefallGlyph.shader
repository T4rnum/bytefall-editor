// Символы Bytefall: повторяет render/instanceShader.ts редактора, чтобы картинка совпадала.
//
// Квад несёт в TEXCOORD1 номер ячейки атласа, номер материала (с 1, 0 — без материала) и режим:
// 0 — сплошной цвет (фон), 1 — символ, 2 — подложка (контур и свечение). В TEXCOORD0 —
// координаты внутри ячейки (0..1, у подложки шире на поле), в TEXCOORD2 — координаты документа на
// экране: X ячейки умножен на отношение сторон ячейки. _Grid — сетка шрифта, пикселей шрифта в
// ячейке; её отношение сторон — форма ячейки.
// Цвета в файле sRGB; в проекте с линейным цветом шейдер переводит их сам. Лежит в Resources,
// чтобы попасть в сборку и для анимаций, загруженных в игре через FromBytes.
Shader "Bytefall/Glyph"
{
    Properties
    {
        _MainTex ("Atlas", 2D) = "white" {}
        _Materials ("Materials", 2D) = "black" {}
        _AtlasGrid ("Atlas columns, rows", Vector) = (1, 1, 0, 0)
        _Grid ("Font pixels per cell", Vector) = (8, 8, 0, 0)
        _FrameTime ("Scene time, s", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" "PreviewType" = "Plane" }
        Cull Off
        ZWrite Off
        Blend SrcAlpha OneMinusSrcAlpha

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            sampler2D _Materials;
            float4 _Materials_TexelSize;
            float4 _AtlasGrid;
            float4 _Grid;
            float _FrameTime;

            float Aspect()
            {
                return _Grid.x / _Grid.y;
            }

            struct appdata
            {
                float4 vertex : POSITION;
                float4 color : COLOR;
                float2 cell : TEXCOORD0;
                float4 custom0 : TEXCOORD1;
                float4 custom1 : TEXCOORD2;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 color : COLOR;
                float4 cellDoc : TEXCOORD0;
                float4 rect : TEXCOORD1;
                float4 modeStrength : TEXCOORD2;
                float4 outline : TEXCOORD3;
                float4 glow : TEXCOORD4;
                float4 shine : TEXCOORD5;
                float4 shineMotion : TEXCOORD6;
                // Мягкость свечения (1 — пятном), строки развёртки, сторона крупного пикселя.
                float4 extra : TEXCOORD7;
            };

            // Точный перевод sRGB в линейный: у встроенного GammaToLinearSpace приближение.
            float3 ToLinear(float3 c)
            {
                return lerp(pow((c + 0.055) / 1.055, 2.4), c / 12.92, step(c, 0.04045));
            }

            float3 ColorOut(float3 c)
            {
                #ifdef UNITY_COLORSPACE_GAMMA
                return c;
                #else
                return ToLinear(c);
                #endif
            }

            float4 Material(float row, float k)
            {
                float2 uv = float2((k + 0.5) * _Materials_TexelSize.x, (row + 0.5) * _Materials_TexelSize.y);
                return tex2Dlod(_Materials, float4(uv, 0, 0));
            }

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = float4(ColorOut(v.color.rgb), v.color.a);
                o.cellDoc = float4(v.cell, v.custom1.xy);
                float2 size = 1.0 / _AtlasGrid.xy;
                float2 at = float2(fmod(v.custom0.x, _AtlasGrid.x), floor(v.custom0.x / _AtlasGrid.x));
                o.rect = float4(at * size, (at + 1.0) * size);
                float row = floor(v.custom0.y + 0.5) - 1.0;
                o.modeStrength = float4(v.custom0.z, 0, 0, 0);
                o.outline = 0;
                o.glow = 0;
                o.shine = 0;
                o.shineMotion = 0;
                o.extra = 0;
                if (row >= 0.0)
                {
                    float4 t2 = Material(row, 2);
                    float4 t3 = Material(row, 3);
                    o.outline = Material(row, 0);
                    o.glow = Material(row, 1);
                    o.modeStrength.y = t2.x;
                    o.shine = float4(t2.yzw, t3.x);
                    float4 t4 = Material(row, 4);
                    o.shineMotion = float4(t3.yzw, t4.x);
                    o.extra = float4(t4.yzw, 0);
                    o.outline.rgb = ColorOut(o.outline.rgb);
                    o.glow.rgb = ColorOut(o.glow.rgb);
                    o.shine.rgb = ColorOut(o.shine.rgb);
                }
                return o;
            }

            bool InsideCell(float2 c)
            {
                return c.x >= 0.0 && c.y >= 0.0 && c.x < 1.0 && c.y < 1.0;
            }

            // Покрыт ли пиксель глифом: бинарно. Строки атласа идут сверху, а v в Unity — снизу.
            // Крупный пиксель (block > 1) берёт центр пикселя шрифта посреди своего блока.
            float Cover(float4 rect, float2 c, float block)
            {
                if (!InsideCell(c)) return 0.0;
                if (block > 1.0) c = (min(floor(c * _Grid.xy / block) * block + floor(block * 0.5), _Grid.xy - 1.0) + 0.5) / _Grid.xy;
                float2 p = lerp(rect.xy, rect.zw, c);
                return step(0.5, tex2Dlod(_MainTex, float4(p.x, 1.0 - p.y, 0, 0)).a);
            }

            float4 Over(float4 top, float4 bottom)
            {
                return top + bottom * (1.0 - top.a);
            }

            // Радиус свечения — в высотах ячейки: по X в долях ячейки он делится на отношение сторон.
            float4 Glow(v2f i)
            {
                float sum = 0.0;
                float total = 0.0;
                float2 radius = float2(i.glow.w / Aspect(), i.glow.w);
                for (int j = -3; j <= 3; j++)
                {
                    for (int k = -3; k <= 3; k++)
                    {
                        float2 s = float2(k, j) / 3.0;
                        float weight = exp(-2.0 * dot(s, s));
                        sum += weight * Cover(i.rect, i.cellDoc.xy + s * radius, i.extra.z);
                        total += weight;
                    }
                }
                float alpha = saturate(sum / total * i.modeStrength.y) * i.color.a;
                return float4(i.glow.rgb * alpha, alpha);
            }

            // Мягкое свечение: пятно вокруг символа без его формы, к радиусу гаснет по Гауссу.
            float4 SoftGlow(v2f i)
            {
                float2 fromCenter = (i.cellDoc.xy - 0.5) * float2(Aspect(), 1.0);
                float d = max(0.0, length(fromCenter) - 0.35) / max(i.glow.w, 0.001);
                float alpha = saturate(exp(-2.0 * d * d) * 0.5 * i.modeStrength.y) * i.color.a;
                return float4(i.glow.rgb * alpha, alpha);
            }

            // Толщина контура — в пикселях шрифта.
            float4 Outline(v2f i)
            {
                float hit = 0.0;
                float2 width = i.outline.w / _Grid.xy;
                for (int dy = -1; dy <= 1; dy++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        float2 dir = float2(dx, dy);
                        hit = max(hit, Cover(i.rect, i.cellDoc.xy + dir * width, i.extra.z));
                        hit = max(hit, Cover(i.rect, i.cellDoc.xy + dir * width * 0.5, i.extra.z));
                    }
                }
                float alpha = hit * i.color.a;
                return float4(i.outline.rgb * alpha, alpha);
            }

            float Bayer2(float2 a)
            {
                a = floor(a);
                return frac(dot(a, float2(0.5, a.y * 0.75)));
            }

            float Bayer4(float2 a)
            {
                return Bayer2(0.5 * a) * 0.25 + Bayer2(a);
            }

            float Shine(v2f i)
            {
                float2 dir = float2(cos(i.shineMotion.z), sin(i.shineMotion.z));
                float spacing = max(i.shineMotion.x, 0.001);
                float along = dot(i.cellDoc.zw, dir) - i.shineMotion.y * _FrameTime;
                float dist = abs(frac(along / spacing + 0.5) - 0.5) * spacing;
                return saturate(1.0 - dist / max(i.shine.w * 0.5, 0.001));
            }

            // Строка развёртки: каждая вторая строка пикселей шрифта.
            bool Scanline(v2f i)
            {
                return i.extra.y > 0.0 && fmod(floor(i.cellDoc.y * _Grid.y), 2.0) > 0.5;
            }

            // Во сколько темнее строка: редактор умножает цвет sRGB, в линейном проекте — тот же множитель
            // в линейном пространстве.
            float3 Darken(v2f i)
            {
                return ColorOut((1.0 - i.extra.y).xxx);
            }

            float4 frag(v2f i) : SV_Target
            {
                float mode = i.modeStrength.x;
                if (mode > 1.5)
                {
                    float4 c = 0;
                    if (i.glow.w > 0.0 && i.modeStrength.y > 0.0) c = i.extra.x > 0.5 ? SoftGlow(i) : Glow(i);
                    if (i.outline.w > 0.0 && Cover(i.rect, i.cellDoc.xy, i.extra.z) < 0.5) c = Over(Outline(i), c);
                    return c.a > 0.0 ? float4(c.rgb / c.a, c.a) : 0;
                }
                if (mode > 0.5)
                {
                    float glyph = Cover(i.rect, i.cellDoc.xy, i.extra.z);
                    if (i.shineMotion.w > 0.0 && Bayer4(floor(i.cellDoc.xy * _Grid.xy)) < i.shineMotion.w) glyph = 0.0;
                    float3 fg = i.color.rgb;
                    if (i.shine.w > 0.0) fg = lerp(fg, i.shine.rgb, Shine(i));
                    if (Scanline(i)) fg *= Darken(i);
                    return float4(fg, glyph * i.color.a);
                }
                // Фон под символом с развёрткой темнеет теми же строками.
                if (Scanline(i)) return float4(i.color.rgb * Darken(i), i.color.a);
                return i.color;
            }
            ENDCG
        }
    }
}
