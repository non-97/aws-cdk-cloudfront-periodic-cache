import { Callback, LambdaFunctionURLEvent, Context } from "aws-lambda";

export const handler = async (
  event: LambdaFunctionURLEvent,
  context: Context,
  callback: Callback
) => {
  const wasshoi = Math.round(Number(event.queryStringParameters?.wasshoi || 0));

  const message =
    !Number.isInteger(wasshoi) || wasshoi <= 0
      ? "わっしょい! したくないのですか ... ?"
      : wasshoi >= 10
      ? "お静かに"
      : Array(wasshoi).fill("わっしょい!!").join(" ");

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      message,
    }),
  };
};
