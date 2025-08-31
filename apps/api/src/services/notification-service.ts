import nodemailer from 'nodemailer';
import { Search, SearchResult, Availability } from '@holiday-park/shared';
import { firebaseService } from './firebase-admin';
import { logger } from '../utils/logger';

export class NotificationService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendSearchResultEmail(search: Search, result: SearchResult): Promise<void> {
    if (!search.id || !result.id) {
      throw new Error('Search and result must have IDs');
    }

    const hasChanges = result.changes && 
                      (result.changes.new.length > 0 || result.changes.removed.length > 0);

    const subject = this.generateSubject(search, result, hasChanges);
    const html = this.generateHtmlContent(search, result);

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'Holiday Park Monitor <noreply@example.com>',
        to: search.notifications.email,
        subject,
        html,
      });

      await firebaseService.logNotification({
        searchId: search.id,
        resultId: result.id,
        sentAt: new Date(),
        recipient: search.notifications.email,
        subject,
        newAvailabilities: result.changes?.new.length || 0,
        removedAvailabilities: result.changes?.removed.length || 0,
        success: true,
      });

      logger.info(`Email sent to ${search.notifications.email} for search ${search.name}`);
    } catch (error) {
      logger.error('Failed to send email:', error);

      if (search.id && result.id) {
        await firebaseService.logNotification({
          searchId: search.id,
          resultId: result.id,
          sentAt: new Date(),
          recipient: search.notifications.email,
          subject,
          newAvailabilities: result.changes?.new.length || 0,
          removedAvailabilities: result.changes?.removed.length || 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      throw error;
    }
  }

  private generateSubject(search: Search, result: SearchResult, hasChanges: boolean): string {
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

    // All current availabilities
    if (result.availabilities.length > 0) {
      html += `
  <h2>Wszystkie dostępne terminy</h2>
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
      for (const availability of result.availabilities) {
        html += this.generateTableRow(availability);
      }
      html += `
    </tbody>
  </table>
`;
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

// Add missing method to firebase service
declare module './firebase-admin' {
  interface FirebaseService {
    updateSearchResult(resultId: string, updates: Partial<SearchResult>): Promise<void>;
  }
}

// Implementation
FirebaseService.prototype.updateSearchResult = async function(
  resultId: string, 
  updates: Partial<SearchResult>
): Promise<void> {
  try {
    await this.db.collection('results').doc(resultId).update(updates);
  } catch (error) {
    logger.error(`Failed to update result ${resultId}:`, error);
    throw error;
  }
};