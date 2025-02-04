async function handler(event) {
  const request = event.request;

  const now = new Date();

  // 10分区切りのブロックを計算
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const hour = now.getUTCHours();
  const minute = Math.floor(now.getUTCMinutes() / 10) * 10;

  const datetimeBlock = `${year}/${month}/${day} ${hour}:${minute
    .toString()
    .padStart(2, "0")} block`;

  request.headers['x-datetime-block'] = {
    value: datetimeBlock
  };

  return request;
}