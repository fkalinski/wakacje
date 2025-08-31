import nodemailer from 'nodemailer';
import { INotificationAdapter } from '../interfaces/notification';
import { ILogger } from '../interfaces/logger';
import { Search, SearchResult, Availability } from '../types';

export interface EmailNotificationOptions {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  from: string;
  logger?: ILogger;
}

export class EmailNotificationAdapter implements INotificationAdapter {
  private transporter: nodemailer.Transporter;
  private from: string;
  private logger?: ILogger;

  constructor(options: EmailNotificationOptions) {
    this.from = options.from;
    this.logger = options.logger;
    this.transporter = nodemailer.createTransport(options.smtp);
  }

  async sendNotification(search: Search, result: SearchResult): Promise<void> {
    if (!search.notifications.email) {
      return;
    }

    const hasChanges = result.changes && 
                      (result.changes.new.length > 0 || result.changes.removed.length > 0);

    const subject = this.generateSubject(search, result, hasChanges);
    const html = this.generateHtmlContent(search, result);

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: search.notifications.email,
        subject,
        html,
      });

      this.logger?.info(`Email sent to ${search.notifications.email} for search ${search.name}`);
    } catch (error) {
      this.logger?.error('Failed to send email:', error);
      throw error;
    }
  }

  async sendError(search: Search, error: Error): Promise<void> {
    if (!search.notifications.email) {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: search.notifications.email,
        subject: `Holiday Park - ${search.name} - Error`,
        html: `
          <h2>Error executing search: ${search.name}</h2>
          <p>An error occurred while checking for availabilities:</p>
          <pre>${error.message}</pre>
          <p>The search will be retried on the next scheduled run.</p>
        `,
      });

      this.logger?.info(`Error email sent to ${search.notifications.email}`);
    } catch (sendError) {
      this.logger?.error('Failed to send error email:', sendError);
    }
  }

  private generateSubject(search: Search, result: SearchResult, hasChanges: boolean | undefined): string {
    if (!hasChanges) {
      return `Holiday Park - ${search.name} - ${result.availabilities.length} dostępnych terminów`;
    }

    const newCount = result.changes?.new.length || 0;
    const removedCount = result.changes?.removed.length || 0;

    if (newCount > 0 && removedCount > 0) {
      return `Holiday Park - ${search.name} - ${newCount} nowych, ${removedCount} usuniętych`;
    } else if (newCount > 0) {
      return `Holiday Park - ${search.name} - ${newCount} nowych terminów!`;
    } else {
      return `Holiday Park - ${search.name} - ${removedCount} terminów już niedostępnych`;
    }
  }

  private generateHtmlContent(search: Search, result: SearchResult): string {
    const hasNewAvailabilities = result.changes?.new && result.changes.new.length > 0;
    const hasRemovedAvailabilities = result.changes?.removed && result.changes.removed.length > 0;

    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 2px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      margin-top: 30px;
    }
    .summary {
      background: #ecf0f1;
      padding: 15px;
      border-radius: 5px;
      margin: 20px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #3498db;
      color: white;
      padding: 10px;
      text-align: left;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:hover {
      background: #f5f5f5;
    }
    .new-row {
      background: #d4edda;
    }
    .removed-row {
      background: #f8d7da;
    }
    .price {
      font-weight: bold;
      color: #27ae60;
    }
    .btn {
      display: inline-block;
      padding: 8px 15px;
      background: #3498db;
      color: white;
      text-decoration: none;
      border-radius: 3px;
    }
    .btn:hover {
      background: #2980b9;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 0.9em;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>Holiday Park Monitor - ${search.name}</h1>
  
  <div class="summary">
    <strong>Podsumowanie:</strong><br>
    Znalezione terminy: ${result.availabilities.length}<br>
    ${hasNewAvailabilities ? `✅ Nowe dostępne: ${result.changes!.new.length}<br>` : ''}
    ${hasRemovedAvailabilities ? `❌ Już niedostępne: ${result.changes!.removed.length}<br>` : ''}
    Data sprawdzenia: ${new Date(result.timestamp).toLocaleString('pl-PL')}
  </div>
`;

    // New availabilities
    if (hasNewAvailabilities) {
      html += `
  <h2>✅ Nowe dostępne terminy</h2>
  <table>
    <thead>
      <tr>
        <th>Ośrodek</th>
        <th>Typ</th>
        <th>Termin</th>
        <th>Noce</th>
        <th>Cena</th>
        <th>Akcja</th>
      </tr>
    </thead>
    <tbody>
`;
      for (const availability of result.changes!.new) {
        html += this.generateTableRow(availability, 'new-row');
      }
      html += `
    </tbody>
  </table>
`;
    }

    // Removed availabilities
    if (hasRemovedAvailabilities) {
      html += `
  <h2>❌ Terminy już niedostępne</h2>
  <table>
    <thead>
      <tr>
        <th>Ośrodek</th>
        <th>Typ</th>
        <th>Termin</th>
        <th>Noce</th>
        <th>Cena</th>
      </tr>
    </thead>
    <tbody>
`;
      for (const availability of result.changes!.removed) {
        html += this.generateTableRow(availability, 'removed-row', false);
      }
      html += `
    </tbody>
  </table>
`;
    }

    // All current availabilities (limited to 10)
    if (result.availabilities.length > 0) {
      const displayCount = Math.min(result.availabilities.length, 10);
      html += `
  <h2>Wszystkie dostępne terminy (pierwsze ${displayCount})</h2>
  <table>
    <thead>
      <tr>
        <th>Ośrodek</th>
        <th>Typ</th>
        <th>Termin</th>
        <th>Noce</th>
        <th>Cena</th>
        <th>Akcja</th>
      </tr>
    </thead>
    <tbody>
`;
      for (let i = 0; i < displayCount; i++) {
        html += this.generateTableRow(result.availabilities[i]);
      }
      html += `
    </tbody>
  </table>
`;
      if (result.availabilities.length > displayCount) {
        html += `<p><em>... i ${result.availabilities.length - displayCount} więcej</em></p>`;
      }
    } else {
      html += `
  <p><strong>Brak dostępnych terminów spełniających kryteria wyszukiwania.</strong></p>
`;
    }

    html += `
  <div class="footer">
    <p>
      Wyszukiwanie: ${search.name}<br>
      Parametry:<br>
      - Terminy: ${search.dateRanges.map(r => `${r.from} do ${r.to}`).join(', ')}<br>
      - Długość pobytu: ${search.stayLengths.join(', ')} dni<br>
      - Ośrodki: ${search.resorts.length > 0 ? search.resorts.join(', ') : 'Wszystkie'}<br>
      - Typy: ${search.accommodationTypes.length > 0 ? search.accommodationTypes.join(', ') : 'Wszystkie'}
    </p>
    <p>
      <small>
        Ta wiadomość została wygenerowana automatycznie przez Holiday Park Monitor.<br>
        Aby zmienić ustawienia powiadomień, zaloguj się do aplikacji.
      </small>
    </p>
  </div>
</body>
</html>
`;

    return html;
  }

  private generateTableRow(availability: Availability, className = '', showAction = true): string {
    const fromDate = new Date(availability.dateFrom).toLocaleDateString('pl-PL');
    const toDate = new Date(availability.dateTo).toLocaleDateString('pl-PL');
    
    let row = `
      <tr class="${className}">
        <td>${availability.resortName}</td>
        <td>${availability.accommodationTypeName}</td>
        <td>${fromDate} - ${toDate}</td>
        <td>${availability.nights}</td>
        <td class="price">${availability.priceTotal.toFixed(2)} zł</td>
`;
    
    if (showAction) {
      row += `
        <td><a href="${availability.link}" class="btn" target="_blank">Rezerwuj</a></td>
`;
    }
    
    row += `
      </tr>
`;
    
    return row;
  }
}