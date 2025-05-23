import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CustomCurrencyPipe } from './custom-currency.pipe';
import { MatDialog } from '@angular/material/dialog';
import { UpdateContactConfirmationComponent } from './update-contact-confirmation.component';
import { ActivatedRoute } from '@angular/router';
import { SupplierService } from '../../../../amplify/services/supplier-form-services/supplier.service';
import { DeliveryService } from '../../../../amplify/services/supplier-form-services/delivery.service';
import { QuoteSubmissionService } from '../../../../amplify/services/supplier-form-services/quote-submission.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../../../../amplify/services/supplier-form-services/notification.service';
import { v4 as uuidv4 } from 'uuid';
import { LoadingSpinnerComponent } from '../loader/loading-spinner.component';
import { SubmissionDeadlineService } from '../../../../amplify/services/supplier-form-services/submission-deadline.service';
import { OrdersService } from '../../../../amplify/services/orders.service';

interface QuoteItem {
  upc: string;
  description: string;
  sku: string;
  requestedQuantity: number;
  isAvailable: boolean;
  availableQuantity: number;
  unitCost: number;
  totalCost: number;
  discount: number;
  totalPrice: number;
}

interface Currency {
  code: string;
  name: string;
}

interface DeliveryAddress {
  company: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  instructions: string;
  contactName: string;
  email: string;
  phone: string;
}

@Component({
  selector: 'app-supplier-form',
  standalone: true,
  imports: [CommonModule, FormsModule, CustomCurrencyPipe, LoadingSpinnerComponent],
  templateUrl: './supplier-form.component.html',
  styleUrl: './supplier-form.component.css'
})
export class SupplierFormComponent implements OnInit {

  supplierID: string = '';
  quoteID: string = '';
  deliveryID: string = '';
  tenentId: string = '';
  isSubmitting: boolean = true;
  submissionDeadline: Date | null = null;
  isDeadlinePassed: boolean = false;

  additionalComments: string = '';
  selectedFiles: File[] = [];
  quoteItems: QuoteItem[] = [];
  selectedCurrency: string = 'ZAR';
  currencies: Currency[] = [
    { code: 'ZAR', name: 'South African Rand' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'GBP', name: 'British Pound' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'CAD', name: 'Canadian Dollar' },
  ];

  deliveryAddress: DeliveryAddress = {
    company: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    instructions: '',
    contactName: '',
    email: '',
    phone: ''
  };

  supplierInfo = {
    companyName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: ''
  };

  vatPercentage: number = 15;
  deliveryDate: string = '';
  deliveryCost: number = 0;

  constructor(
    private dialog: MatDialog, 
    private route: ActivatedRoute, 
    private supplierService: SupplierService, 
    private deliveryService: DeliveryService, 
    private quoteSubmissionService: QuoteSubmissionService,
    private snackBar: MatSnackBar,
    private notificationService: NotificationService,
    private submissionDeadlineService: SubmissionDeadlineService,
    private ordersService: OrdersService
  ) {}

  ngOnInit() {
    this.isSubmitting = true;
    this.route.params.subscribe(params => {
      this.supplierID = params['supplierID'] || '';
      this.quoteID = params['quoteID'] || '';
      this.deliveryID = params['deliveryID'] || '';
      this.tenentId = params['tenentId'] || '';
      console.log('Supplier ID:', this.supplierID);
      console.log('Quote ID:', this.quoteID);
      console.log('Delivery ID:', this.deliveryID);
      console.log('Tenent ID:', this.tenentId);
      
      Promise.all([
        this.loadSupplierData(),
        this.loadDeliveryInfo(),
        this.loadQuoteItems(),
        this.loadSubmissionDeadline()
      ]).finally(() => {
        this.isSubmitting = false;
      });
    });

    this.quoteItems = [];
    this.updateAllTotals();
    this.setDefaultDeliveryDate();
  }

  loadSupplierData(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.supplierID && this.tenentId) {
        this.supplierService.getSupplierInfo(this.tenentId, this.supplierID).subscribe(
          (data) => {
            console.log('Received supplier data:', data);
            this.supplierInfo = {
              companyName: data.company_name,
              contactPerson: data.contact_name,
              email: data.contact_email,
              phone: data.phone_number,
              address: `${data.address.street}, ${data.address.city}, ${data.address.state_province}, ${data.address.postal_code}, ${data.address.country}`
            };
            console.log('Updated supplierInfo:', this.supplierInfo);
            resolve();
          },
          (error) => {
            console.error('Error fetching supplier data:', error);
            reject(error);
          }
        );
      } else {
        resolve();
      }
    });
  }

  loadDeliveryInfo(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.tenentId && this.deliveryID) {
        this.deliveryService.getDeliveryInfo(this.tenentId, this.deliveryID).subscribe(
          (data) => {
            console.log('Received delivery data:', data);
            this.deliveryAddress = {
              company: data.companyName,
              street: data.street,
              city: data.city,
              state: data.state,
              postalCode: data.postalCode,
              country: data.country,
              instructions: data.deliveryInstructions,
              contactName: data.contactName,
              email: data.email,
              phone: data.phone
            };
            console.log('Updated deliveryAddress:', this.deliveryAddress);
            resolve();
          },
          (error) => {
            console.error('Error fetching delivery data:', error);
            reject(error);
          }
        );
      } else {
        resolve();
      }
    });
  }

  async loadQuoteItems() {
    try {
  
      this.ordersService.getQuoteItems(this.tenentId, this.quoteID)
        .subscribe(
          (items: any[]) => {
            this.quoteItems = items.map((item: any) => ({
              upc: item.UPC,
              description: item.Description,
              sku: item.ItemSKU,
              requestedQuantity: item.Quantity,
              isAvailable: true,
              availableQuantity: item.Quantity,
              unitCost: 0,
              totalCost: 0,
              discount: 0,
              totalPrice: 0
            }));
          },
          (error) => {
            console.error('Error fetching quote items:', error);
          }
        );
    } catch (error) {
      console.error('Error in loadQuoteItems:', error);
    }
  }

  loadSubmissionDeadline(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.quoteID) {
        this.submissionDeadlineService.getSubmissionDeadline(this.quoteID).subscribe(
          (deadline) => {
            this.submissionDeadline = deadline;
            console.log('Submission deadline:', this.submissionDeadline);
            this.checkDeadline();
            resolve();
          },
          (error) => {
            console.error('Error fetching submission deadline:', error);
            reject(error);
          }
        );
      } else {
        resolve();
      }
    });
  }

  checkDeadline() {
    if (this.submissionDeadline) {
      this.isDeadlinePassed = new Date() > this.submissionDeadline;
      console.log('Is deadline passed:', this.isDeadlinePassed);
    }
  }

  setDefaultDeliveryDate() {
    const today = new Date();
    const twoWeeksFromNow = new Date(today.setDate(today.getDate() + 14));
    this.deliveryDate = twoWeeksFromNow.toISOString().split('T')[0];
  }

  updateTotals(index: number) {
    const item = this.quoteItems[index];
    if (item.isAvailable) {
      item.availableQuantity = this.validatePositiveNumber(item.availableQuantity);
      item.unitCost = this.validatePositiveNumber(item.unitCost);
      item.discount = this.validatePositiveNumber(item.discount);
      item.totalCost = item.availableQuantity * item.unitCost;
      const discountAmount = item.totalCost * (item.discount / 100);
      item.totalPrice = item.totalCost - discountAmount;
    } else {
      item.totalCost = 0;
      item.totalPrice = 0;
    }
    this.updateTotalQuoteValue();
  }

  updateAllTotals() {
    this.quoteItems.forEach((_, index) => this.updateTotals(index));
  }

  onAvailabilityChange(index: number) {
    const item = this.quoteItems[index];
    if (!item.isAvailable) {
      item.availableQuantity = 0;
      item.unitCost = 0;
      item.discount = 0;
    } else {
      item.availableQuantity = item.requestedQuantity;
    }
    this.updateTotals(index);
  }

  getSubtotal(): number {
    return this.quoteItems.reduce((total, item) => total + item.totalPrice, 0);
  }

  getVatAmount(): number {
    return this.getSubtotal() * (this.vatPercentage / 100);
  }

  getTotalQuoteValue(): number {
    return this.getSubtotal() + this.getVatAmount() + this.deliveryCost;
  }

  updateTotalQuoteValue() {
    this.vatPercentage = this.validatePositiveNumber(this.vatPercentage);
    this.deliveryCost = this.validatePositiveNumber(this.deliveryCost);
  }

  validateForm(): string | null {
    if (!this.deliveryDate) {
      return "Please select a valid delivery date.";
    }
  
    // Add any other validations you want here
    // For example, checking if all required fields are filled
  
    return null; // Return null if the form is valid
  }

  submitQuote() {

    const validationError = this.validateForm();
    if (validationError) {
      this.snackBar.open(validationError, 'Close', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'top',
      });
      return; // Don't proceed with submission if there's an error
    }
  

    this.isSubmitting = true;
    const quoteData = {
      quoteItems: this.quoteItems.map(item => ({
        upc: item.upc,
        sku: item.sku,
        unitCost: item.unitCost,
        availableQuantity: item.availableQuantity,
        totalPrice: item.totalPrice,
        discount: item.discount,
        isAvailable: item.isAvailable,
      })),
      quoteDetails: {
        QuoteID: this.quoteID,
        SupplierID: this.supplierID,
        vatPercentage: this.vatPercentage,
        vatAmount: this.getVatAmount(),
        deliveryDate: this.deliveryDate,
        deliveryCost: this.deliveryCost,
        subtotal: this.getSubtotal(),
        totalQuoteValue: this.getTotalQuoteValue(),
        currency: this.selectedCurrency,
        additionalComments: this.additionalComments,
        tenentId: this.tenentId
      }
    };

    this.quoteSubmissionService.submitQuote(quoteData).subscribe(
      (response) => {
        console.log('Quote submitted successfully:', response);
        this.snackBar.open('Quote submitted successfully!', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
        this.isSubmitting = false;
      },
      (error) => {
        console.error('Error submitting quote:', error);
        this.snackBar.open('Error submitting quote. Please try again.', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
        this.isSubmitting = false;
      }
    );
  }

  updateCurrency() {
    console.log('Currency updated to:', this.selectedCurrency);
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        if (this.isValidFile(file)) {
          this.selectedFiles.push(file);
        } else {
          console.warn(`File ${file.name} is not valid and was not added.`);
        }
      }
    }
  }
  
  removeFile(file: File) {
    const index = this.selectedFiles.indexOf(file);
    if (index > -1) {
      this.selectedFiles.splice(index, 1);
    }
  }
  
  isValidFile(file: File): boolean {
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    const maxSize = 10 * 1024 * 1024; // 10MB
  
    return validTypes.includes(file.type) && file.size <= maxSize;
  }

  openUpdateContactModal() {
    const dialogRef = this.dialog.open(UpdateContactConfirmationComponent, {
      width: '350px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.sendUpdateContactRequest();
      }
    });
  }

  validatePositiveNumber(value: number): number {
    return value < 0 ? 0 : value;
  }
  
  validateFutureDate(event: any) {
    const selectedDate = new Date(event.target.value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
  
    if (selectedDate < today) {
      this.snackBar.open('Please select a future date for delivery.', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top',
      });
      this.deliveryDate = '';
    }
  }

  sendUpdateContactRequest() {
    const notificationData = {
      tenentId: this.tenentId,
      timestamp: new Date().toISOString(),
      notificationId: uuidv4(),
      type: 'SUPPLIER_CONTACT_UPDATE_REQUEST',
      message: `${this.supplierInfo.companyName} requested to update their contact information`,
      isRead: false
    };
  
    this.notificationService.createNotification(notificationData).subscribe(
      (response) => {
        console.log('Notification created successfully:', response);
        this.snackBar.open('Contact update request sent successfully!', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
      },
      (error) => {
        console.error('Error creating notification:', error);
        this.snackBar.open('Error sending update request. Please try again.', 'Close', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
        });
      }
    );
  }
}