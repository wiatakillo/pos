"""
Purchase Order PDF Generator

Professional PDF generation for purchase orders using ReportLab.
"""

from datetime import datetime, timezone
from io import BytesIO
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# Color scheme (matching app design)
PRIMARY_COLOR = colors.HexColor("#c45d35")  # Warm terracotta
DARK_COLOR = colors.HexColor("#1f2937")  # Dark gray
MUTED_COLOR = colors.HexColor("#6b7280")  # Muted gray
BORDER_COLOR = colors.HexColor("#e5e7eb")  # Light border
SUCCESS_COLOR = colors.HexColor("#059669")  # Green for totals


def generate_purchase_order_pdf(
    order_data: dict,
    supplier_data: dict,
    items: list[dict],
    company_name: str = "Your Restaurant",
    company_address: str = "",
) -> BytesIO:
    """
    Generate a professional PDF for a purchase order.
    
    Args:
        order_data: PO details (order_number, order_date, expected_date, status, notes, totals)
        supplier_data: Supplier info (name, code, contact_name, phone, email, address)
        items: List of line items with inventory_item_sku, inventory_item_name, 
               quantity_ordered, unit, unit_cost_cents, line_total_cents
        company_name: Restaurant/company name for header
        company_address: Company address for header
    
    Returns:
        BytesIO buffer containing the PDF
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm,
    )
    
    # Styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'POTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=PRIMARY_COLOR,
        spaceAfter=2*mm,
        alignment=TA_RIGHT,
    )
    
    subtitle_style = ParagraphStyle(
        'POSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=MUTED_COLOR,
        alignment=TA_RIGHT,
    )
    
    company_style = ParagraphStyle(
        'Company',
        parent=styles['Normal'],
        fontSize=14,
        textColor=DARK_COLOR,
        fontName='Helvetica-Bold',
    )
    
    address_style = ParagraphStyle(
        'Address',
        parent=styles['Normal'],
        fontSize=10,
        textColor=MUTED_COLOR,
        leading=14,
    )
    
    section_header_style = ParagraphStyle(
        'SectionHeader',
        parent=styles['Normal'],
        fontSize=10,
        textColor=MUTED_COLOR,
        fontName='Helvetica-Bold',
        spaceBefore=10*mm,
        spaceAfter=3*mm,
    )
    
    supplier_name_style = ParagraphStyle(
        'SupplierName',
        parent=styles['Normal'],
        fontSize=13,
        textColor=DARK_COLOR,
        fontName='Helvetica-Bold',
        spaceAfter=2*mm,
    )
    
    normal_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontSize=10,
        textColor=DARK_COLOR,
        leading=14,
    )
    
    notes_style = ParagraphStyle(
        'Notes',
        parent=styles['Normal'],
        fontSize=10,
        textColor=MUTED_COLOR,
        fontStyle='italic',
        leading=14,
    )
    
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=MUTED_COLOR,
        alignment=TA_CENTER,
    )
    
    # Build story
    story = []
    
    # ===== HEADER SECTION =====
    # Two-column header: Company info (left) | PO title (right)
    order_date = order_data.get('order_date', '')
    if isinstance(order_date, str) and order_date:
        try:
            order_date = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
            order_date_str = order_date.strftime('%B %d, %Y')
        except:
            order_date_str = order_date
    else:
        order_date_str = str(order_date) if order_date else ''
    
    expected_date = order_data.get('expected_date', '')
    if isinstance(expected_date, str) and expected_date:
        try:
            expected_date = datetime.fromisoformat(expected_date.replace('Z', '+00:00'))
            expected_date_str = expected_date.strftime('%B %d, %Y')
        except:
            expected_date_str = expected_date
    else:
        expected_date_str = 'TBD' if not expected_date else str(expected_date)
    
    header_data = [
        [
            Paragraph(company_name, company_style),
            Paragraph("PURCHASE ORDER", title_style),
        ],
        [
            Paragraph(company_address.replace('\n', '<br/>') if company_address else '', address_style),
            Paragraph(f"<b>PO#</b> {order_data.get('order_number', '')}", subtitle_style),
        ],
        [
            "",
            Paragraph(f"<b>Date:</b> {order_date_str}", subtitle_style),
        ],
        [
            "",
            Paragraph(f"<b>Expected:</b> {expected_date_str}", subtitle_style),
        ],
    ]
    
    header_table = Table(header_data, colWidths=[90*mm, 80*mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 8*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR))
    
    # ===== SUPPLIER SECTION =====
    story.append(Paragraph("SUPPLIER", section_header_style))
    story.append(Paragraph(supplier_data.get('name', 'Unknown Supplier'), supplier_name_style))
    
    supplier_details = []
    if supplier_data.get('code'):
        supplier_details.append(f"Code: {supplier_data['code']}")
    if supplier_data.get('contact_name'):
        supplier_details.append(f"Contact: {supplier_data['contact_name']}")
    if supplier_data.get('phone'):
        supplier_details.append(f"Phone: {supplier_data['phone']}")
    if supplier_data.get('email'):
        supplier_details.append(f"Email: {supplier_data['email']}")
    if supplier_data.get('address'):
        supplier_details.append(f"Address: {supplier_data['address']}")
    
    if supplier_details:
        story.append(Paragraph('<br/>'.join(supplier_details), address_style))
    
    story.append(Spacer(1, 5*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR))
    
    # ===== ITEMS TABLE =====
    story.append(Paragraph("ORDER ITEMS", section_header_style))
    
    # Table header
    table_data = [[
        Paragraph("<b>SKU</b>", normal_style),
        Paragraph("<b>Item</b>", normal_style),
        Paragraph("<b>Qty</b>", normal_style),
        Paragraph("<b>Unit</b>", normal_style),
        Paragraph("<b>Unit Price</b>", normal_style),
        Paragraph("<b>Total</b>", normal_style),
    ]]
    
    # Table rows
    for item in items:
        unit_price = item.get('unit_cost_cents', 0) / 100
        line_total = item.get('line_total_cents', 0) / 100
        qty = item.get('quantity_ordered', 0)
        if isinstance(qty, Decimal):
            qty = float(qty)
        
        table_data.append([
            Paragraph(item.get('inventory_item_sku', '-')[:15], normal_style),
            Paragraph(item.get('inventory_item_name', '-'), normal_style),
            Paragraph(f"{qty:.2f}", normal_style),
            Paragraph(item.get('unit', 'piece'), normal_style),
            Paragraph(f"${unit_price:,.2f}", normal_style),
            Paragraph(f"${line_total:,.2f}", normal_style),
        ])
    
    # If no items, add placeholder
    if not items:
        table_data.append([
            Paragraph("-", normal_style),
            Paragraph("No items in this order", notes_style),
            Paragraph("-", normal_style),
            Paragraph("-", normal_style),
            Paragraph("-", normal_style),
            Paragraph("-", normal_style),
        ])
    
    items_table = Table(
        table_data,
        colWidths=[25*mm, 65*mm, 18*mm, 18*mm, 22*mm, 22*mm],
        repeatRows=1,
    )
    items_table.setStyle(TableStyle([
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f9fafb")),
        ('TEXTCOLOR', (0, 0), (-1, 0), DARK_COLOR),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        
        # Data rows
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        
        # Alignment
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        
        # Borders
        ('LINEBELOW', (0, 0), (-1, 0), 1, BORDER_COLOR),
        ('LINEBELOW', (0, 1), (-1, -2), 0.5, BORDER_COLOR),
        ('LINEBELOW', (0, -1), (-1, -1), 1, BORDER_COLOR),
        
        # Alternating row colors
        *[('BACKGROUND', (0, i), (-1, i), colors.HexColor("#f9fafb")) 
          for i in range(2, len(table_data), 2)],
    ]))
    story.append(items_table)
    
    # ===== TOTALS SECTION =====
    story.append(Spacer(1, 5*mm))
    
    subtotal = order_data.get('subtotal_cents', 0) / 100
    tax = order_data.get('tax_cents', 0) / 100
    total = order_data.get('total_cents', 0) / 100
    
    totals_style = ParagraphStyle(
        'Totals',
        parent=styles['Normal'],
        fontSize=10,
        textColor=DARK_COLOR,
        alignment=TA_RIGHT,
    )
    
    total_bold_style = ParagraphStyle(
        'TotalBold',
        parent=styles['Normal'],
        fontSize=12,
        textColor=SUCCESS_COLOR,
        fontName='Helvetica-Bold',
        alignment=TA_RIGHT,
    )
    
    totals_data = [
        ["", "", "", "", Paragraph("Subtotal:", totals_style), Paragraph(f"${subtotal:,.2f}", totals_style)],
    ]
    if tax > 0:
        totals_data.append(
            ["", "", "", "", Paragraph("Tax:", totals_style), Paragraph(f"${tax:,.2f}", totals_style)]
        )
    totals_data.append(
        ["", "", "", "", Paragraph("<b>TOTAL:</b>", totals_style), Paragraph(f"${total:,.2f}", total_bold_style)]
    )
    
    totals_table = Table(
        totals_data,
        colWidths=[25*mm, 65*mm, 18*mm, 18*mm, 22*mm, 22*mm],
    )
    totals_table.setStyle(TableStyle([
        ('ALIGN', (4, 0), (-1, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(totals_table)
    
    # ===== NOTES SECTION =====
    if order_data.get('notes'):
        story.append(Spacer(1, 8*mm))
        story.append(HRFlowable(width="100%", thickness=1, color=BORDER_COLOR))
        story.append(Paragraph("NOTES", section_header_style))
        story.append(Paragraph(order_data['notes'], notes_style))
    
    # ===== FOOTER =====
    story.append(Spacer(1, 15*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER_COLOR))
    story.append(Spacer(1, 3*mm))
    
    generated_at = datetime.now(timezone.utc).strftime('%B %d, %Y at %I:%M %p UTC')
    story.append(Paragraph(f"Generated on {generated_at}", footer_style))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer
