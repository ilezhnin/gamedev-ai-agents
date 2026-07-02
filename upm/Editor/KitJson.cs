using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GamedevAgentKit.Editor
{
    /// <summary>
    /// Minimal JSON reader/writer for the kit manifest. Keeps the package free
    /// of external JSON dependencies. Objects parse to Dictionary&lt;string, object&gt;,
    /// arrays to List&lt;object&gt;, plus string, double, bool, and null values.
    /// </summary>
    internal static class KitJson
    {
        internal static object Parse(string text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return null;
            }

            var index = 0;
            var value = ParseValue(text, ref index);
            SkipWhitespace(text, ref index);
            return value;
        }

        internal static string WriteString(string value)
        {
            if (value == null)
            {
                return "null";
            }

            var sb = new StringBuilder(value.Length + 2);
            sb.Append('"');
            foreach (var c in value)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ')
                        {
                            sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }

            sb.Append('"');
            return sb.ToString();
        }

        private static object ParseValue(string text, ref int index)
        {
            SkipWhitespace(text, ref index);
            if (index >= text.Length)
            {
                throw new FormatException("Unexpected end of JSON input.");
            }

            switch (text[index])
            {
                case '{': return ParseObject(text, ref index);
                case '[': return ParseArray(text, ref index);
                case '"': return ParseString(text, ref index);
                case 't': ExpectLiteral(text, ref index, "true"); return true;
                case 'f': ExpectLiteral(text, ref index, "false"); return false;
                case 'n': ExpectLiteral(text, ref index, "null"); return null;
                default: return ParseNumber(text, ref index);
            }
        }

        private static Dictionary<string, object> ParseObject(string text, ref int index)
        {
            var result = new Dictionary<string, object>(StringComparer.Ordinal);
            index++; // consume '{'
            SkipWhitespace(text, ref index);
            if (index < text.Length && text[index] == '}')
            {
                index++;
                return result;
            }

            while (true)
            {
                SkipWhitespace(text, ref index);
                var key = ParseString(text, ref index);
                SkipWhitespace(text, ref index);
                Expect(text, ref index, ':');
                result[key] = ParseValue(text, ref index);
                SkipWhitespace(text, ref index);
                if (index >= text.Length)
                {
                    throw new FormatException("Unterminated JSON object.");
                }

                if (text[index] == ',')
                {
                    index++;
                    continue;
                }

                Expect(text, ref index, '}');
                return result;
            }
        }

        private static List<object> ParseArray(string text, ref int index)
        {
            var result = new List<object>();
            index++; // consume '['
            SkipWhitespace(text, ref index);
            if (index < text.Length && text[index] == ']')
            {
                index++;
                return result;
            }

            while (true)
            {
                result.Add(ParseValue(text, ref index));
                SkipWhitespace(text, ref index);
                if (index >= text.Length)
                {
                    throw new FormatException("Unterminated JSON array.");
                }

                if (text[index] == ',')
                {
                    index++;
                    continue;
                }

                Expect(text, ref index, ']');
                return result;
            }
        }

        private static string ParseString(string text, ref int index)
        {
            Expect(text, ref index, '"');
            var sb = new StringBuilder();
            while (index < text.Length)
            {
                var c = text[index++];
                if (c == '"')
                {
                    return sb.ToString();
                }

                if (c != '\\')
                {
                    sb.Append(c);
                    continue;
                }

                if (index >= text.Length)
                {
                    break;
                }

                var escape = text[index++];
                switch (escape)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (index + 4 > text.Length)
                        {
                            throw new FormatException("Truncated unicode escape in JSON string.");
                        }
                        sb.Append((char)ushort.Parse(text.Substring(index, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        index += 4;
                        break;
                    default:
                        throw new FormatException("Invalid escape '\\" + escape + "' in JSON string.");
                }
            }

            throw new FormatException("Unterminated JSON string.");
        }

        private static object ParseNumber(string text, ref int index)
        {
            var start = index;
            while (index < text.Length && "+-0123456789.eE".IndexOf(text[index]) >= 0)
            {
                index++;
            }

            var token = text.Substring(start, index - start);
            if (!double.TryParse(token, NumberStyles.Float, CultureInfo.InvariantCulture, out var value))
            {
                throw new FormatException("Invalid JSON number '" + token + "'.");
            }

            return value;
        }

        private static void ExpectLiteral(string text, ref int index, string literal)
        {
            if (index + literal.Length > text.Length || string.CompareOrdinal(text, index, literal, 0, literal.Length) != 0)
            {
                throw new FormatException("Invalid JSON literal at position " + index + ".");
            }

            index += literal.Length;
        }

        private static void Expect(string text, ref int index, char expected)
        {
            if (index >= text.Length || text[index] != expected)
            {
                throw new FormatException("Expected '" + expected + "' at position " + index + " of JSON input.");
            }

            index++;
        }

        private static void SkipWhitespace(string text, ref int index)
        {
            while (index < text.Length && char.IsWhiteSpace(text[index]))
            {
                index++;
            }
        }
    }
}
