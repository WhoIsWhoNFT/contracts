// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

///-------------------------------------------------------------------
///  __          ___          _____  __          ___
///  \ \        / / |        |_   _| \ \        / / |
///   \ \  /\  / /| |__   ___  | |  __\ \  /\  / /| |__   ___
///    \ \/  \/ / | '_ \ / _ \ | | / __\ \/  \/ / | '_ \ / _ \
///     \  /\  /  | | | | (_) || |_\__ \\  /\  /  | | | | (_) |
///      \/  \/   |_| |_|\___/_____|___/ \/  \/   |_| |_|\___/
///
///-------------------------------------------------------------------
///
/// wagmi

import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./MultiConfirm.sol";

error WhoIsWho__ZeroMintAmount();
error WhoIsWho__MaxMint();
error WhoIsWho__InsufficientFunds();
error WhoIsWho__StageNotReady();
error WhoIsWho__InvalidProof();
error WhoIsWho__NonExistentTokenId();

contract WhoIsWho is ERC721A, MultiConfirm, Ownable, AccessControl, ReentrancyGuard {
    using Strings for uint256;

    enum SaleStage {
        IDLE,
        PRESALE_OG,
        PRESALE_WL,
        PUBLIC_SALE
    }

    ///////////////////////////////////////////////
    /// Constants
    //////////////////////////////////////////////

    /// Operator role
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    /// Presale price for OG members
    uint256 public constant PRESALE_PRICE_OG = 0.02 ether;

    /// Presale price for whitelist members
    uint256 public constant PRESALE_PRICE_WL = 0.025 ether;

    /// Total supply
    uint32 public constant TOTAL_SUPPLY = 5000;

    /// Interval for OG members to mint their token during presale
    uint16 public constant PRESALE_INTERVAL = 15 minutes;

    /// Number of reserved tokens
    uint16 public constant RESERVED_TOKENS = 50;

    /// Max number of tokens per OG wallet
    uint16 public constant PRESALE_MAX_TOKEN_PER_OG = 3;

    /// Max number of tokens per WL wallet
    uint16 public constant PRESALE_MAX_TOKEN_PER_WL = 2;

    ///////////////////////////////////////////////
    /// Storage
    //////////////////////////////////////////////

    /// Price per token for public sale
    uint256 public price;

    /// Presale Date
    uint64 public presaleDate;

    /// Public sale date
    uint64 public publicSaleDate;

    /// Reveal Date
    uint64 public revealDate;

    /// Max token per wallet for public sale
    uint32 public maxTokenPerWallet;

    /// Merkle roots for OG
    bytes32 public ogMerkleRoot;

    /// Merkle roots for whitelist members
    bytes32 public wlMerkleRoot;

    /// Contract URI
    string public contractURI;

    /// Metadata URI
    string private metadataBaseURI;

    /// Hidden token URI
    string private hiddenTokenURI;

    /// Owner's balance during public sale
    mapping(address => uint256) public publicSaleBalances;

    ///////////////////////////////////////////////
    /// Events
    //////////////////////////////////////////////

    event SetPrice(uint256 indexed _price);

    event SetMaxTokenPerWallet(uint256 indexed _maxTokenPerWallet);

    event SetContractURI(string indexed _uri);

    event SetMetadataBaseURI(string indexed _uri);

    event SetHiddenTokenURI(string indexed _uri);

    event SetOgMerkleRoot(bytes32 indexed _merkleRoot);

    event SetWlMerkleRoot(bytes32 indexed _merkleRoot);

    event SetPresaleDate(uint64 indexed _date);

    event SetPublicSaleDate(uint64 indexed _date);

    event SetRevealDate(uint64 indexed _date);

    event Withdraw(uint256 indexed _dateWithdrew, uint256 _amount);

    ///////////////////////////////////////////////
    /// Constructor
    //////////////////////////////////////////////

    constructor(
        address _owner,
        uint256 _price,
        uint32 _maxTokenPerWallet,
        uint64 _presaleDate,
        uint64 _publicSaleDate,
        uint64 _revealDate,
        bytes32 _ogMerkleRoot,
        bytes32 _wlMerkleRoot,
        address[] memory _operators,
        string memory _contractURI,
        string memory _hiddenTokenURI
    ) ERC721A("Who Is Who", "WhoIsWho") MultiConfirm(_operators) {
        price = _price;
        maxTokenPerWallet = _maxTokenPerWallet;
        ogMerkleRoot = _ogMerkleRoot;
        wlMerkleRoot = _wlMerkleRoot;
        contractURI = _contractURI;
        hiddenTokenURI = _hiddenTokenURI;

        /**
         * @notice Initial presale, public, and reveal dates are set during contract's deployment.
         * These are changeable variables; this might change after the contract has been deployed
         */
        presaleDate = _presaleDate;
        publicSaleDate = _publicSaleDate;
        revealDate = _revealDate;

        for (uint256 i = 0; i < _operators.length; i++) {
            _grantRole(OPERATOR_ROLE, _operators[i]);
        }

        /// @dev Owner's address should be included in the operators array
        require(hasRole(OPERATOR_ROLE, _owner), "owner should be an operator");

        /// Transfer ownership
        _grantRole(OPERATOR_ROLE, _msgSender());
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _transferOwnership(_owner);

        /// Mint reserved tokens to the owner
        _safeMint(_owner, RESERVED_TOKENS);
    }

    ///////////////////////////////////////////////
    /// Modifiers
    //////////////////////////////////////////////
    modifier stageCompliance(SaleStage _stage) {
        SaleStage stage = getSaleStage();

        /// @notice Allow OG to mint tokens during whitelist stage
        if (_stage == SaleStage.PRESALE_OG) {
            if (stage != SaleStage.PRESALE_OG && stage != SaleStage.PRESALE_WL) {
                revert WhoIsWho__StageNotReady();
            }
        }

        if (stage != _stage) {
            revert WhoIsWho__StageNotReady();
        }
        _;
    }

    /**
     * @dev THIS MODIFIER SHOULD BE STRICTLY PLACED FIRST AMONG ALL OTHER RELATED
     * MINT COMPLIANCE MODIFIERS TO AVOID OVERFLOW ON THE `_mintAmount` VARIABLE.
     */
    modifier mintCompliance(uint256 _mintAmount, uint256 _maxTokenPerMint) {
        if (_mintAmount > _maxTokenPerMint) {
            revert WhoIsWho__MaxMint();
        }

        if (_mintAmount == 0) {
            revert WhoIsWho__ZeroMintAmount();
        }

        /**
         * @dev Overflow is impossible because `_mintAmount` is check first if it
         * is greater than `_maxTokenPerMint` and `_maxTokenPerMint` is static
         */
        unchecked {
            uint256 totalSupplyAfterMint = totalSupply() + _mintAmount;
            if (totalSupplyAfterMint > TOTAL_SUPPLY) {
                revert WhoIsWho__MaxMint();
            }
        }
        _;
    }

    modifier mintComplianceForPresale(uint256 _mintAmount, uint256 _presaleMaxTokenPerMint) {
        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first in the
         * `mintCompliance` modifier
         */
        unchecked {
            uint256 totalBalanceAfterMint = balanceOf(_msgSender()) + _mintAmount;
            if (totalBalanceAfterMint > _presaleMaxTokenPerMint) {
                revert WhoIsWho__MaxMint();
            }
        }
        _;
    }

    modifier mintComplianceForPublicSale(uint256 _mintAmount) {
        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first in the
         * `mintCompliance` modifier
         */
        unchecked {
            uint256 totalBalanceAfterMint = publicSaleBalances[_msgSender()] + _mintAmount;
            if (totalBalanceAfterMint > maxTokenPerWallet) {
                revert WhoIsWho__MaxMint();
            }
        }
        _;
    }

    modifier mintPriceCompliance(uint256 _mintAmount, uint256 _price) {
        /**
         * @dev Overflow is impossible because `_mintAmount` is validated first in the
         * `mintCompliance` modifier
         */
        unchecked {
            uint256 totalCost = _price * _mintAmount;
            if (totalCost > msg.value) {
                revert WhoIsWho__InsufficientFunds();
            }
        }
        _;
    }

    ///////////////////////////////////////////////
    /// Public methods
    //////////////////////////////////////////////

    function ogMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_OG)
        mintCompliance(_mintAmount, PRESALE_MAX_TOKEN_PER_OG)
        mintComplianceForPresale(_mintAmount, PRESALE_MAX_TOKEN_PER_OG)
        mintPriceCompliance(_mintAmount, PRESALE_PRICE_OG)
    {
        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
        if (!MerkleProof.verify(_merkleProof, ogMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }
        _safeMint(_msgSender(), _mintAmount);
    }

    function wlMint(
        uint256 _mintAmount,
        bytes32[] calldata _merkleProof
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PRESALE_WL)
        mintCompliance(_mintAmount, PRESALE_MAX_TOKEN_PER_WL)
        mintComplianceForPresale(_mintAmount, PRESALE_MAX_TOKEN_PER_WL)
        mintPriceCompliance(_mintAmount, PRESALE_PRICE_WL)
    {
        bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
        if (!MerkleProof.verify(_merkleProof, wlMerkleRoot, leaf)) {
            revert WhoIsWho__InvalidProof();
        }
        _safeMint(_msgSender(), _mintAmount);
    }

    function mint(
        uint256 _mintAmount
    )
        external
        payable
        nonReentrant
        stageCompliance(SaleStage.PUBLIC_SALE)
        mintCompliance(_mintAmount, maxTokenPerWallet)
        mintComplianceForPublicSale(_mintAmount)
        mintPriceCompliance(_mintAmount, price)
    {
        publicSaleBalances[_msgSender()] += _mintAmount;
        _safeMint(_msgSender(), _mintAmount);
    }

    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        if (!_exists(_tokenId)) {
            revert WhoIsWho__NonExistentTokenId();
        }

        if (!isReveal()) {
            return hiddenTokenURI;
        }

        string memory currentBaseURI = _baseURI();

        if (bytes(currentBaseURI).length > 0) {
            return string(abi.encodePacked(currentBaseURI, _tokenId.toString(), ".json"));
        }

        return "";
    }

    function getSaleStage() public view returns (SaleStage stage) {
        uint256 timeNow = block.timestamp;

        if (timeNow >= publicSaleDate) {
            return SaleStage.PUBLIC_SALE;
        }

        uint64 interval;

        /**
         * @dev Overflow is impossible because `presaleDate` is set by the admin and
         * `PRESALE_INTERVAL` is a constant
         */
        unchecked {
            /**
             * @dev Adding `PRESALE_INTERVAL` to the presale date, it means that the minting
             * timeframe for OG members has elapsed
             */
            interval = presaleDate + PRESALE_INTERVAL;
        }

        if (timeNow >= interval) {
            return SaleStage.PRESALE_WL;
        }

        /**
         * @notice During presale, OG members will have the first access to minting their
         * tokens, followed by whitelist members who can start minting only after a
         * specified time period defined in `PRESALE_INTERVAL`
         */
        if (timeNow >= presaleDate) {
            return SaleStage.PRESALE_OG;
        }

        return SaleStage.IDLE;
    }

    function getPublicSaleBalance(address _account) public view returns (uint256) {
        return publicSaleBalances[_account];
    }

    ///////////////////////////////////////////////
    /// Internal methods
    //////////////////////////////////////////////

    function isReveal() internal view returns (bool) {
        return uint64(block.timestamp) >= revealDate;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return metadataBaseURI;
    }

    ///////////////////////////////////////////////
    /// Operator methods
    //////////////////////////////////////////////

    /// Allow operator to airdrop token in any sale stage
    function mint(address _recipient, uint256 _mintAmount) external payable onlyRole(OPERATOR_ROLE) {
        _safeMint(_recipient, _mintAmount);
    }

    /// Sets the public price of the token
    function setPrice(uint256 _price) external onlyRole(OPERATOR_ROLE) {
        price = _price;
        emit SetPrice(_price);
    }

    ///  Sets the maximum token per wallet during public sale
    function setMaxTokenPerWallet(uint32 _maxTokenPerWallet) external onlyRole(OPERATOR_ROLE) {
        maxTokenPerWallet = _maxTokenPerWallet;
        emit SetMaxTokenPerWallet(_maxTokenPerWallet);
    }

    /// Sets contract uri for Opensea
    function setContractURI(string memory _uri) external onlyRole(OPERATOR_ROLE) {
        contractURI = _uri;
        emit SetContractURI(_uri);
    }

    /// Sets token medata uri
    function setMetadataBaseURI(string memory _uri) external onlyRole(OPERATOR_ROLE) {
        metadataBaseURI = _uri;
        emit SetMetadataBaseURI(_uri);
    }

    /// Sets hidden token uri
    function setHiddenTokenURI(string memory _uri) external onlyRole(OPERATOR_ROLE) {
        hiddenTokenURI = _uri;
        emit SetHiddenTokenURI(_uri);
    }

    /// Sets OG merkle root for lazy minting
    function setOgMerkleRoot(bytes32 _merkleRoot) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.IDLE) {
        ogMerkleRoot = _merkleRoot;
        emit SetOgMerkleRoot(_merkleRoot);
    }

    /// Sets WL merkle root for lazy minting
    function setWlMerkleRoot(bytes32 _merkleRoot) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.IDLE) {
        wlMerkleRoot = _merkleRoot;
        emit SetWlMerkleRoot(_merkleRoot);
    }

    /// Sets presale date during only in the idle stage
    function setPresaleDate(uint64 _date) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.IDLE) {
        presaleDate = _date;
        emit SetPresaleDate(_date);
    }

    /// Sets public sale date during only in the idle stage
    function setPublicSaleDate(uint64 _date) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.IDLE) {
        publicSaleDate = _date;
        emit SetPublicSaleDate(_date);
    }

    /// Sets reveal date
    function setRevealDate(uint64 _date) external onlyRole(OPERATOR_ROLE) {
        revealDate = _date;
        emit SetRevealDate(_date);
    }

    function submitWithdrawTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.PUBLIC_SALE) {
        /// @inheritdoc `MultiConfirm.sol`
        _submitTransaction(_to, _value, _data);
    }

    function confirmWithdrawTransaction(
        uint256 _txIndex
    ) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.PUBLIC_SALE) {
        /// @inheritdoc `MultiConfirm.sol`
        _confirmTransaction(_txIndex);
    }

    function revokeConfirmation(
        uint256 _txIndex
    ) external onlyRole(OPERATOR_ROLE) stageCompliance(SaleStage.PUBLIC_SALE) {
        /// @inheritdoc `MultiConfirm.sol`
        _revokeConfirmation(_txIndex);
    }

    /** @notice The owner can withdraw the funds if the base uri is already set, approved
     *  by the approvers, and if it's already in the public sale stage
     */
    function withdraw(uint256 _txIndex) external onlyOwner stageCompliance(SaleStage.PUBLIC_SALE) {
        string memory currentBaseURI = _baseURI();
        require(bytes(currentBaseURI).length > 0, "Base URI not set");

        /// @inheritdoc `MultiConfirm.sol`
        _executeTransaction(_txIndex);
    }

    /// @dev Override `supportsInterface`
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721A, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
